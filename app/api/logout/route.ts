import { NextResponse } from "next/server"
import { ROOT_HOST } from "@/lib/host"

/**
 * Logout через API route — обходим NextResponse.cookies.set, который
 * под капотом дедуплицирует cookie по имени (так что 4 set с одним
 * именем уходят в браузер как ОДИН последний). Ставим Set-Cookie
 * напрямую через headers.append — в HTTP допускаются несколько
 * Set-Cookie с одинаковым именем (но разными path/domain).
 */
function buildClearCookie(name: string, opts: { domain?: string; secure?: boolean }): string {
  const parts = [
    `${name}=`,
    `Path=/`,
    `Max-Age=0`,
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `HttpOnly`,
    `SameSite=Lax`,
  ]
  if (opts.secure) parts.push(`Secure`)
  if (opts.domain) parts.push(`Domain=${opts.domain}`)
  return parts.join("; ")
}

function buildLogoutResponse(req: Request): NextResponse {
  const isProduction = process.env.NODE_ENV === "production"
  const cookieName = isProduction
    ? "__Secure-commrent.session-token"
    : "commrent.session-token"

  const url = new URL(req.url)
  const currentHost = url.hostname
  const rootHost = ROOT_HOST || "commrent.kz"
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "") ?? "https"

  // 303 See Other → браузер переключится с POST на GET.
  const res = NextResponse.redirect(`${proto}://${rootHost}/login`, 303)

  // Все возможные домены, на которых cookie мог быть выставлен.
  // Каждый — отдельный Set-Cookie заголовок (через append).
  const domains: (string | undefined)[] = [
    undefined,         // host-scoped (без атрибута Domain)
    currentHost,       // bcf16.commrent.kz
    `.${rootHost}`,    // .commrent.kz (это то, что выставляет наш auth.ts)
    rootHost,          // commrent.kz без точки
  ]

  for (const domain of domains) {
    res.headers.append("Set-Cookie", buildClearCookie(cookieName, { domain, secure: true }))
  }

  // CSRF/callback токены NextAuth — на всякий случай
  for (const name of [
    "authjs.csrf-token",
    "__Host-authjs.csrf-token",
    "authjs.callback-url",
    "__Secure-authjs.callback-url",
  ]) {
    res.headers.append("Set-Cookie", buildClearCookie(name, { secure: isProduction }))
  }

  return res
}

export async function GET(req: Request) {
  return buildLogoutResponse(req)
}

export async function POST(req: Request) {
  return buildLogoutResponse(req)
}
