"use server"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { revalidatePath } from "next/cache"

/**
 * Управление singleton-состоянием программы Founders Pricing.
 * Только платформ-админ.
 */
export async function updateFoundersState(input: {
  isActive?: boolean
  totalSlots?: number
  discountPct?: number
}): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformOwner()

  const data: Record<string, unknown> = {}
  if (typeof input.isActive === "boolean") data.isActive = input.isActive
  if (typeof input.totalSlots === "number") {
    if (input.totalSlots < 1 || input.totalSlots > 1000) {
      return { ok: false, error: "totalSlots должен быть от 1 до 1000" }
    }
    data.totalSlots = Math.floor(input.totalSlots)
  }
  if (typeof input.discountPct === "number") {
    if (input.discountPct < 0 || input.discountPct > 100) {
      return { ok: false, error: "discountPct должен быть от 0 до 100" }
    }
    data.discountPct = Math.floor(input.discountPct)
  }
  if (Object.keys(data).length === 0) return { ok: false, error: "Нет изменений" }

  await db.foundersProgramState.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      totalSlots: typeof input.totalSlots === "number" ? Math.floor(input.totalSlots) : 15,
      discountPct: typeof input.discountPct === "number" ? Math.floor(input.discountPct) : 40,
      isActive: typeof input.isActive === "boolean" ? input.isActive : true,
    },
    update: data,
  })

  revalidatePath("/superadmin/founders")
  revalidatePath("/")
  return { ok: true }
}

/**
 * Ручной отзыв слота Founders (если клиент ушёл или платформа решила отозвать).
 * Декрементит takenSlots и снимает флаги с организации.
 */
export async function releaseFoundersSlot(orgId: string): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformOwner()
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { isFoundersMember: true },
  })
  if (!org) return { ok: false, error: "Организация не найдена" }
  if (!org.isFoundersMember) return { ok: false, error: "Организация не Founders-член" }

  await db.$transaction([
    db.organization.update({
      where: { id: orgId },
      data: { isFoundersMember: false, foundersLockedPct: 0, foundersSlotNumber: null },
    }),
    db.foundersProgramState.update({
      where: { id: "singleton" },
      data: { takenSlots: { decrement: 1 } },
    }),
  ])
  revalidatePath("/superadmin/founders")
  return { ok: true }
}

/**
 * Ручной выдача статуса Founders конкретной организации (если платформа решила).
 * Атомарно: проверяет лимит, выставляет флаги, инкрементит takenSlots.
 */
export async function grantFoundersSlot(orgId: string): Promise<{ ok: boolean; error?: string; slotNumber?: number }> {
  await requirePlatformOwner()
  const r = await db.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { isFoundersMember: true, plan: { select: { code: true } } },
    })
    if (!org) return { ok: false as const, error: "Организация не найдена" }
    if (org.isFoundersMember) return { ok: false as const, error: "Уже Founders-член" }
    if (org.plan?.code === "FREE") return { ok: false as const, error: "Free-тариф не участвует в Founders" }

    const state = await tx.foundersProgramState.findUnique({ where: { id: "singleton" } })
    if (!state) return { ok: false as const, error: "Founders-состояние не инициализировано" }
    if (state.takenSlots >= state.totalSlots) return { ok: false as const, error: "Слоты закончились" }

    const slotNumber = state.takenSlots + 1
    await tx.foundersProgramState.update({
      where: { id: "singleton" },
      data: { takenSlots: { increment: 1 } },
    })
    await tx.organization.update({
      where: { id: orgId },
      data: {
        isFoundersMember: true,
        foundersLockedPct: state.discountPct,
        foundersJoinedAt: new Date(),
        foundersSlotNumber: slotNumber,
      },
    })
    return { ok: true as const, slotNumber }
  })
  revalidatePath("/superadmin/founders")
  return r
}
