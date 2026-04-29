import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { parseHost } from "@/lib/host"

/**
 * Маршрутизация по host:
 *
 *   commrent.kz             — публичный сайт: лендинг, /login, юр. документы
 *   www.commrent.kz         — то же
 *   <slug>.commrent.kz      — рабочая зона организации (admin / cabinet)
 *   <reserved>.commrent.kz  — 404 (api, www, admin, ...)
 *
 * Для безопасности slug организации прокидывается в заголовки
 * (x-org-slug, x-org-host-kind) — server-actions используют их для проверки,
 * что user.organizationId соответствует slug в URL.
 */

// Пути, разрешённые на корневом домене
const PUBLIC_ROOT_PATHS = new Set([
  "/", "/login", "/offer", "/privacy", "/terms", "/sla",
])
const PUBLIC_ROOT_PREFIXES = ["/api/health", "/_next", "/favicon", "/icon", "/manifest"]

function isPublicRootPath(path: string): boolean {
  if (PUBLIC_ROOT_PATHS.has(path)) return true
  return PUBLIC_ROOT_PREFIXES.some((p) => path.startsWith(p))
}

export default auth((req) => {
  const { nextUrl } = req
  const session = req.auth
  const isLoggedIn = !!session
  const role = session?.user?.role
  const isPlatformOwner = session?.user?.isPlatformOwner ?? false

  const path = nextUrl.pathname
  const host = parseHost(req.headers.get("host"))

  const isAdminRoute = path.startsWith("/admin")
  const isCabinetRoute = path.startsWith("/cabinet")
  const isSuperadminRoute = path.startsWith("/superadmin")
  const isLoginPage = path === "/login"

  // ─── Корневой / external host (публичный сайт) ──────────────────
  if (host.kind === "root" || host.kind === "external") {
    // Платформенный админ — пропускаем в /superadmin везде, где есть.
    // Это позволяет работать на корневом домене и preview-инстансах.
    if (host.kind === "root") {
      // На корневом домене не разрешаем вход в admin/cabinet —
      // вход в систему всегда через slug-поддомен.
      if (isAdminRoute || isCabinetRoute) {
        // Платформенный админ — отдельная история, его пускаем (он на корневом).
        if (isLoggedIn && isPlatformOwner) {
          // OK — в impersonate-режиме платформа-админ работает в /admin
        } else {
          return NextResponse.redirect(new URL("/login", req.url))
        }
      }

      // Только публичные пути и /superadmin (для платформ-админа) на корневом.
      const allowed = isPublicRootPath(path)
        || isAdminRoute
        || isCabinetRoute
        || isSuperadminRoute
      if (!allowed) {
        return NextResponse.redirect(new URL("/", req.url))
      }
    }
  }

  // ─── Reserved subdomain — 404 ───────────────────────────────────
  if (host.kind === "reserved") {
    return new NextResponse("Not Found", { status: 404 })
  }

  // ─── Invalid subdomain ─────────────────────────────────────────
  if (host.kind === "invalid") {
    return NextResponse.redirect(new URL("/", `https://${process.env.ROOT_HOST || "commrent.kz"}`))
  }

  // ─── Login redirect для уже залогиненных ────────────────────────
  if (isLoginPage && isLoggedIn) {
    if (isPlatformOwner) {
      const res = NextResponse.redirect(new URL("/superadmin", req.url))
      res.cookies.delete("impersonating")
      res.cookies.delete("superadmin_currentOrgId")
      return res
    }
    return NextResponse.redirect(
      new URL(role === "TENANT" ? "/cabinet" : "/admin", req.url)
    )
  }

  // ─── Защита приватных маршрутов ─────────────────────────────────
  if (!isLoggedIn && (isAdminRoute || isCabinetRoute || isSuperadminRoute)) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (isSuperadminRoute && !isPlatformOwner) {
    return NextResponse.redirect(new URL("/admin", req.url))
  }

  if (isLoggedIn && isCabinetRoute && isPlatformOwner) {
    return NextResponse.redirect(new URL("/superadmin", req.url))
  }

  if (isLoggedIn && isAdminRoute && role === "TENANT" && !isPlatformOwner) {
    return NextResponse.redirect(new URL("/cabinet", req.url))
  }

  if (isLoggedIn && isCabinetRoute && role !== "TENANT") {
    return NextResponse.redirect(new URL("/admin", req.url))
  }

  // ─── Проброс информации о host в заголовки ──────────────────────
  // Server-side код (lib/org.ts → requireOrgAccess) использует их
  // для проверки совпадения slug ↔ user.organizationId.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-org-host-kind", host.kind)
  if (host.kind === "subdomain") {
    requestHeaders.set("x-org-slug", host.slug)
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: [
    "/((?!api/auth|api/telegram/webhook|api/email/track|api/cron|_next/static|_next/image|favicon.ico|icon.*|manifest.json).*)",
  ],
}
