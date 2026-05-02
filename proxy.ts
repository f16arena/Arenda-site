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
  "/", "/login", "/signup", "/offer", "/privacy", "/terms", "/sla",
  "/verify-email", "/forgot-password", "/reset-password",
])
// API-роуты разрешены на root-домене: они сами проверяют сессию через auth().
// Без этого fetch('/api/...') из /admin/* на корневом домене редиректился бы
// на '/' и клиент получал бы HTML вместо JSON.
// /booking — публичная витрина свободных площадей.
// /sign — публичная страница подписи договора по уникальному токену.
const PUBLIC_ROOT_PREFIXES = ["/api/", "/_next", "/favicon", "/icon", "/manifest", "/booking", "/sign"]

function isPublicRootPath(path: string): boolean {
  if (PUBLIC_ROOT_PATHS.has(path)) return true
  return PUBLIC_ROOT_PREFIXES.some((p) => path.startsWith(p))
}

// Включается, когда DNS на *.commrent.kz уже настроен. Пока false — root-домен
// тоже пускает в /admin и /cabinet (иначе вход ломается до настройки поддоменов).
const ENFORCE_SUBDOMAIN = process.env.ENFORCE_SUBDOMAIN === "true"

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

  // ─── Reserved subdomain — 404 ───────────────────────────────────
  if (host.kind === "reserved") {
    return new NextResponse("Not Found", { status: 404 })
  }

  // ─── Invalid subdomain ─────────────────────────────────────────
  if (host.kind === "invalid") {
    return NextResponse.redirect(new URL("/", `https://${process.env.ROOT_HOST || "commrent.kz"}`))
  }

  // ─── Slug-поддомен: только рабочая зона ─────────────────────────
  // На bcf16.commrent.kz: разрешены только /admin/*, /cabinet/*, /api/*.
  // Лендинг, юр. документы, /login — всё это живёт ТОЛЬКО на root.
  // Заходишь на bcf16.commrent.kz/ → тебя выкидывает: либо в /admin
  // (если залогинен и в этой org), либо на commrent.kz/login.
  if (host.kind === "subdomain") {
    const rootHost = process.env.ROOT_HOST || "commrent.kz"
    const isApi = path.startsWith("/api/")
    const isStatic = path.startsWith("/_next/") || path.startsWith("/favicon") || path.startsWith("/icon") || path.startsWith("/manifest")

    if (!isAdminRoute && !isCabinetRoute && !isSuperadminRoute && !isApi && !isStatic) {
      // Корень или любой публичный путь на slug → редирект
      if (path === "/") {
        if (isLoggedIn && !isPlatformOwner) {
          return NextResponse.redirect(new URL(role === "TENANT" ? "/cabinet" : "/admin", req.url))
        }
        return NextResponse.redirect(`https://${rootHost}/login`)
      }
      if (path === "/login") {
        // /login доступен только на корне
        return NextResponse.redirect(`https://${rootHost}/login`)
      }
      // Юр. документы, /verify-email и любые другие — на корень.
      // ВАЖНО: сохраняем query-параметры (например ?token=xxx для verify-email).
      const query = nextUrl.search // включает "?" если есть параметры
      return NextResponse.redirect(`https://${rootHost}${path}${query}`)
    }
  }

  // ─── Корневой/external host: /admin и /cabinet недоступны ───────
  // Когда ENFORCE_SUBDOMAIN включён, рабочая зона живёт на slug-поддомене.
  // На root домене / vercel.app: не пускаем в /admin и /cabinet кроме платформа-админа.
  // (Не редиректим в middleware — отправляем на /login, где server-component
  // разрулит куда дальше: на slug.commrent.kz или /superadmin.)
  if (ENFORCE_SUBDOMAIN && (host.kind === "root" || host.kind === "external")) {
    if ((isAdminRoute || isCabinetRoute) && !isPlatformOwner) {
      return NextResponse.redirect(new URL("/login", req.url))
    }

    // Только публичные пути и /superadmin (для платформ-админа).
    if (host.kind === "root") {
      const allowed = isPublicRootPath(path)
        || isAdminRoute   // (только для platformOwner — выше уже отфильтровано)
        || isCabinetRoute // (то же)
        || isSuperadminRoute
      if (!allowed) {
        return NextResponse.redirect(new URL("/", req.url))
      }
    }
  }

  // ─── Login для платформ-админа: сразу в /superadmin ─────────────
  // (для остальных: server-component на /login сам сделает редирект на slug-поддомен,
  // через middleware не делаем — иначе redirect loop с /admin на root домене.)
  if (isLoginPage && isLoggedIn && isPlatformOwner) {
    const res = NextResponse.redirect(new URL("/superadmin", req.url))
    res.cookies.delete("impersonating")
    res.cookies.delete("superadmin_currentOrgId")
    return res
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
    // /api/logout исключён, чтобы middleware (auth() wrapper) не рефрешил
    // session cookie в момент логаута — иначе наша очистка cookie конфликтует
    // с обновлённым cookie от middleware и пользователь "не выходит".
    "/((?!api/auth|api/logout|api/telegram/webhook|api/email/track|api/cron|_next/static|_next/image|favicon.ico|icon.*|manifest.json).*)",
  ],
}
