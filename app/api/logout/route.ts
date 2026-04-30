import { NextResponse } from "next/server"
import { ROOT_HOST } from "@/lib/host"

/**
 * Альтернативный logout через API route.
 * Server actions иногда не дочищают cookie на slug-поддомене —
 * этот эндпоинт строит ответ напрямую и явно стирает cookie во всех скоупах.
 *
 * Поддерживает GET и POST (для form action и для прямой ссылки).
 */
function buildLogoutResponse(req: Request): NextResponse {
  const isProduction = process.env.NODE_ENV === "production"
  const cookieName = isProduction
    ? "__Secure-commrent.session-token"
    : "commrent.session-token"

  const url = new URL(req.url)
  const currentHost = url.hostname
  const rootHost = ROOT_HOST || "commrent.kz"
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "") ?? "https"

  // Редиректим на корневой /login (303 See Other для form-submit)
  const res = NextResponse.redirect(`${proto}://${rootHost}/login`, 303)

  // Все скоупы, на которых cookie мог быть выставлен
  const domains: (string | undefined)[] = [
    undefined,         // host-scoped
    currentHost,       // bcf16.commrent.kz
    `.${rootHost}`,    // .commrent.kz
    rootHost,          // commrent.kz без точки
  ]

  for (const domain of domains) {
    res.cookies.set({
      name: cookieName,
      value: "",
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      ...(domain ? { domain } : {}),
    })
  }

  // CSRF/callback токены NextAuth — на всякий случай
  for (const name of [
    "authjs.csrf-token",
    "__Host-authjs.csrf-token",
    "authjs.callback-url",
    "__Secure-authjs.callback-url",
  ]) {
    res.cookies.set({
      name,
      value: "",
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    })
  }

  return res
}

export async function GET(req: Request) {
  return buildLogoutResponse(req)
}

export async function POST(req: Request) {
  return buildLogoutResponse(req)
}
