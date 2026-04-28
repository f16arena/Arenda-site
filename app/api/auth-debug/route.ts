import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

export const dynamic = "force-dynamic"

// GET /api/auth-debug?login=f16arena@gmail.com&password=F16arena2024!
// Диагностика — показывает что именно не так с авторизацией.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const login = searchParams.get("login") ?? ""
  const password = searchParams.get("password") ?? ""

  if (!login || !password) {
    return NextResponse.json({
      error: "Передайте ?login=...&password=...",
    }, { status: 400 })
  }

  try {
    const user = await db.user.findFirst({
      where: {
        OR: [{ email: login }, { phone: login }],
      },
    })

    if (!user) {
      return NextResponse.json({
        ok: false,
        step: "find_user",
        error: "Пользователь не найден",
        login_tried: login,
      })
    }

    const isMatch = await bcrypt.compare(password, user.password)

    return NextResponse.json({
      ok: isMatch,
      step: isMatch ? "success" : "password_mismatch",
      user_found: true,
      user_id: user.id,
      user_role: user.role,
      user_email: user.email,
      user_phone: user.phone,
      user_is_active: user.isActive,
      hash_prefix: user.password.substring(0, 10),
      hash_length: user.password.length,
      password_length: password.length,
      password_match: isMatch,
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      step: "exception",
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    }, { status: 500 })
  }
}
