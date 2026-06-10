import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const user = await db.user.findUnique({
    where: { id: result.ctx.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      telegramChatId: true,
      totpEnabledAt: true,
      mustChangePassword: true,
    },
  })

  return NextResponse.json({
    user: user ?? {
      id: result.ctx.user.id,
      name: result.ctx.user.name,
      email: result.ctx.user.email,
      role: result.ctx.user.role,
    },
    organization: result.ctx.org,
  })
}

export async function PATCH(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const body = (await req.json().catch(() => null)) as {
    name?: string
    phone?: string
  } | null

  const name = body?.name?.trim()
  const phoneRaw = body?.phone?.trim() ?? null

  if (name !== undefined && (name.length < 2 || name.length > 120)) {
    return mobileError("Имя должно быть от 2 до 120 символов")
  }

  let phone: string | null | undefined
  if (phoneRaw !== undefined) {
    if (phoneRaw === null || phoneRaw === "") {
      phone = null
    } else {
      const normalized = phoneRaw.replace(/[^\d+]/g, "")
      if (!/^\+?\d{10,15}$/.test(normalized)) {
        return mobileError("Введите телефон в международном формате")
      }
      const conflict = await db.user.findFirst({
        where: { phone: normalized, NOT: { id: result.ctx.user.id } },
        select: { id: true },
      })
      if (conflict) return mobileError("Этот телефон уже привязан к другому аккаунту", 409)
      phone = normalized
    }
  }

  const data: Record<string, unknown> = {}
  if (name) data.name = name
  if (phone !== undefined) {
    data.phone = phone
    data.phoneVerifiedAt = null
  }

  if (Object.keys(data).length === 0) return mobileError("Нечего обновлять")

  const updated = await db.user.update({
    where: { id: result.ctx.user.id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      telegramChatId: true,
      totpEnabledAt: true,
      mustChangePassword: true,
    },
  })

  return NextResponse.json({ user: updated })
}
