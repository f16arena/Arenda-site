import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { nextUrl } = req
  const session = req.auth
  const isLoggedIn = !!session
  const role = session?.user?.role

  const isAdminRoute = nextUrl.pathname.startsWith("/admin")
  const isCabinetRoute = nextUrl.pathname.startsWith("/cabinet")
  const isLoginPage = nextUrl.pathname === "/login"

  if (isLoginPage) {
    if (!isLoggedIn) return NextResponse.next()
    return NextResponse.redirect(
      new URL(role === "TENANT" ? "/cabinet" : "/admin", req.url)
    )
  }

  if (!isLoggedIn && (isAdminRoute || isCabinetRoute)) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (isLoggedIn && isAdminRoute && role === "TENANT") {
    return NextResponse.redirect(new URL("/cabinet", req.url))
  }

  if (isLoggedIn && isCabinetRoute && role !== "TENANT") {
    return NextResponse.redirect(new URL("/admin", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/admin/:path*", "/cabinet/:path*", "/login"],
}
