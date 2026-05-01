"use server"

import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { headers, cookies } from "next/headers"
import { db } from "@/lib/db"
import { parseHost, ROOT_HOST } from "@/lib/host"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"

export interface LoginState {
  error?: string
  details?: { step: string; ms: number; ok: boolean; note?: string }[]
}

export async function login(_prevState: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const loginValue = String(formData.get("login") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const details: NonNullable<LoginState["details"]> = []

  function step(label: string, t0: number, ok: boolean, note?: string) {
    details.push({ step: label, ms: Date.now() - t0, ok, note })
  }

  if (!loginValue || !password) {
    return { error: "Введите телефон/email и пароль", details }
  }

  // ── 0. Rate limiting: max 10 попыток за 15 минут с одного IP ─
  const h = await headers()
  const rl = checkRateLimit(getClientKey(h, "login"), { max: 10, window: 15 * 60_000 })
  if (!rl.ok) {
    return {
      error: `Слишком много попыток входа. Попробуйте через ${Math.ceil(rl.retryAfterSec / 60)} мин.`,
      details,
    }
  }

  // ── 1. Sanity-check БД через простой запрос ────────────────────
  let t0 = Date.now()
  try {
    await db.$queryRawUnsafe<{ ok: number }[]>("SELECT 1 as ok")
    step("db.ping", t0, true)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    step("db.ping", t0, false, msg)
    return {
      error: `Сервер БД недоступен. ${msg}`,
      details,
    }
  }

  // ── 2. Поиск пользователя ──────────────────────────────────────
  let user: {
    id: string
    role: string
    isActive: boolean
    isPlatformOwner: boolean
    organizationId: string | null
    organization: { slug: string } | null
  } | null = null
  t0 = Date.now()
  try {
    user = await db.user.findFirst({
      where: { OR: [{ phone: loginValue }, { email: loginValue }] },
      select: {
        id: true,
        role: true,
        isActive: true,
        isPlatformOwner: true,
        organizationId: true,
        organization: { select: { slug: true } },
      },
    })
    step("db.findUser", t0, true, user ? `id=${user.id} role=${user.role} active=${user.isActive}` : "not_found")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    step("db.findUser", t0, false, msg)
    return { error: `Ошибка поиска пользователя: ${msg}`, details }
  }

  if (!user) {
    return { error: "Пользователь не найден. Проверьте телефон/email.", details }
  }
  if (!user.isActive) {
    return { error: "Аккаунт деактивирован. Обратитесь к администратору.", details }
  }

  // ── 3. signIn ──────────────────────────────────────────────────
  t0 = Date.now()
  try {
    await signIn("credentials", {
      login: loginValue,
      password,
      redirect: false,
    })
    step("auth.signIn", t0, true)
  } catch (error) {
    if (error instanceof AuthError) {
      const cause = (error as { cause?: { err?: { message?: string } } }).cause?.err?.message
      step("auth.signIn", t0, false, `AuthError: ${cause ?? error.message}`)
      return {
        error: cause?.includes("password") || error.type === "CredentialsSignin"
          ? "Неверный пароль"
          : `Ошибка авторизации: ${cause ?? error.message}`,
        details,
      }
    }
    const msg = error instanceof Error ? error.message : String(error)
    step("auth.signIn", t0, false, msg)
    return { error: `Ошибка входа: ${msg}`, details }
  }

  // ── 4. Редирект ────────────────────────────────────────────────
  // Платформенный админ → /superadmin (на текущем домене)
  if (user.isPlatformOwner) {
    redirect("/superadmin")
  }

  const target = user.role === "TENANT" ? "/cabinet" : "/admin"

  // Без организации (orphan) — некуда вести; пусть /admin сам обработает
  if (!user.organization?.slug) {
    redirect(target)
  }

  // Если уже на нужном поддомене — относительный редирект.
  const host = parseHost(h.get("host"))
  if (host.kind === "subdomain" && host.slug === user.organization.slug) {
    redirect(target)
  }

  // Иначе — абсолютный редирект на slug-поддомен.
  // Cookie domain=.commrent.kz уже выставлен в auth.ts → сессия сохранится.
  const proto = h.get("x-forwarded-proto") ?? "https"
  redirect(`${proto}://${user.organization.slug}.${ROOT_HOST}${target}`)
}

export async function logout() {
  // Не используем NextAuth signOut() — он непредсказуемо взаимодействует с
  // domain=.commrent.kz cookie на slug-поддомене (один из cookie остаётся
  // живым → пользователь "не выходит"). Чистим cookie сами во всех
  // возможных скоупах (текущий host, .commrent.kz, commrent.kz без точки)
  // и со ВСЕМИ комбинациями атрибутов, которые мог использовать NextAuth.
  const isProduction = process.env.NODE_ENV === "production"
  const cookieName = isProduction
    ? "__Secure-commrent.session-token"
    : "commrent.session-token"

  const h = await headers()
  const currentHost = (h.get("host") ?? "").split(":")[0]
  const rootHost = ROOT_HOST || "commrent.kz"
  const cookieStore = await cookies()

  const baseDeleteOptions = {
    name: cookieName,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax" as const,
  }

  // Все возможные домены, на которых cookie мог быть выставлен.
  // Дубликаты не страшны — браузер их обработает.
  const domains = [
    undefined,                  // host-scoped (без атрибута Domain)
    currentHost,                // явно текущий host (bcf16.commrent.kz)
    `.${rootHost}`,             // .commrent.kz (текущий конфиг)
    rootHost,                   // commrent.kz без точки
  ]

  for (const domain of domains) {
    // С secure: true (для production / __Secure- префикса)
    cookieStore.set({
      ...baseDeleteOptions,
      secure: true,
      ...(domain ? { domain } : {}),
    })
    // Без secure (для dev / устаревших cookie)
    if (!isProduction) {
      cookieStore.set({
        ...baseDeleteOptions,
        secure: false,
        ...(domain ? { domain } : {}),
      })
    }
  }

  // На всякий случай чистим CSRF/callback токены NextAuth
  for (const name of [
    "authjs.csrf-token",
    "__Host-authjs.csrf-token",
    "authjs.callback-url",
    "__Secure-authjs.callback-url",
  ]) {
    cookieStore.set({ name, value: "", path: "/", maxAge: 0, sameSite: "lax" })
  }

  // Редирект всегда на корневой /login.
  const proto = h.get("x-forwarded-proto") ?? "https"
  redirect(`${proto}://${rootHost}/login`)
}
