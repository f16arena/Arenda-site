"use server"

import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { headers, cookies } from "next/headers"
import { db } from "@/lib/db"
import { parseHost, ROOT_HOST } from "@/lib/host"

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
  const h = await headers()
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
  await signOut({ redirect: false })

  // Явно вычищаем session cookie на ВСЕХ возможных скоупах:
  // 1) текущий host (bcf16.commrent.kz),
  // 2) родительский .commrent.kz (используется в production).
  // NextAuth signOut иногда оставляет один из вариантов, что приводит к
  // мнимому "залогинен" после редиректа.
  const isProduction = process.env.NODE_ENV === "production"
  const cookieName = isProduction
    ? "__Secure-commrent.session-token"
    : "commrent.session-token"

  const cookieStore = await cookies()
  cookieStore.set({ name: cookieName, value: "", path: "/", maxAge: 0 })
  if (isProduction && ROOT_HOST) {
    cookieStore.set({
      name: cookieName,
      value: "",
      path: "/",
      maxAge: 0,
      domain: `.${ROOT_HOST}`,
      secure: true,
      sameSite: "lax",
    })
  }

  // Редирект всегда на корневой /login (на slug-поддомене /login недоступен —
  // proxy.ts всё равно бы перенаправил, но мы экономим прыжок).
  const h = await headers()
  const proto = h.get("x-forwarded-proto") ?? "https"
  const rootHost = ROOT_HOST || "commrent.kz"
  redirect(`${proto}://${rootHost}/login`)
}
