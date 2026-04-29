"use server"

import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"

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
  let user: { id: string; role: string; isActive: boolean } | null = null
  t0 = Date.now()
  try {
    user = await db.user.findFirst({
      where: { OR: [{ phone: loginValue }, { email: loginValue }] },
      select: { id: true, role: true, isActive: true },
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
    const ms = Date.now() - t0
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

  redirect(user.role === "TENANT" ? "/cabinet" : "/admin")
}

export async function logout() {
  await signOut({ redirectTo: "/login" })
}
