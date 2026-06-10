import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { checkRateLimit } from "@/lib/rate-limit"
import { PasswordChangeSchema, firstZodError } from "@/lib/schemas"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const rl = checkRateLimit(`mobile-pwd:${result.ctx.user.id}`, {
    max: 10,
    window: 10 * 60_000,
  })
  if (!rl.ok) {
    return mobileError(
      `Слишком много попыток. Попробуйте через ${Math.ceil(rl.retryAfterSec / 60)} мин.`,
      429,
    )
  }

  const body = (await req.json().catch(() => null)) as {
    currentPassword?: string
    newPassword?: string
    confirmPassword?: string
  } | null

  const parsed = PasswordChangeSchema.safeParse({
    currentPassword: body?.currentPassword ?? "",
    newPassword: body?.newPassword ?? "",
    confirmPassword: body?.confirmPassword ?? "",
  })
  if (!parsed.success) return mobileError(firstZodError(parsed.error))

  const user = await db.user.findUnique({
    where: { id: result.ctx.user.id },
    select: { id: true, password: true },
  })
  if (!user) return mobileError("Пользователь не найден", 404)

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.password)
  if (!valid) return mobileError("Текущий пароль неверный", 400)

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10)
  await db.user.update({
    where: { id: user.id },
    data: {
      password: newHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}
