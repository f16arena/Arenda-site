"use server"

import { db } from "@/lib/db"
import { headers } from "next/headers"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { revalidatePath } from "next/cache"

/**
 * Публичный server-action: создаёт Lead из формы публичной booking-витрины.
 * Не требует авторизации, но защищён rate-limit и санитизацией.
 */
export async function createBookingLead(
  orgSlug: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Жёсткий rate-limit: 3 заявки за 10 мин с одного IP — защита от спама ботов
  const reqHeaders = await headers()
  const rl = checkRateLimit(getClientKey(reqHeaders, "booking"), { max: 3, window: 10 * 60_000 })
  if (!rl.ok) {
    return {
      ok: false,
      error: `Слишком много заявок. Попробуйте через ${Math.ceil(rl.retryAfterSec / 60)} мин.`,
    }
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 100)
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 30)
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 100)
  const buildingIdRaw = String(formData.get("buildingId") ?? "").trim()
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 500)

  if (!name) return { ok: false, error: "Введите имя" }
  if (!phone) return { ok: false, error: "Введите телефон" }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Некорректный email" }
  }

  // Найти организацию
  const org = await db.organization.findUnique({
    where: { slug: orgSlug, isActive: true, isSuspended: false },
    select: { id: true, buildings: { where: { isActive: true }, select: { id: true } } },
  })
  if (!org) return { ok: false, error: "Организация не найдена" }

  // buildingId должен принадлежать этой организации
  const buildingId = buildingIdRaw && org.buildings.some((b) => b.id === buildingIdRaw)
    ? buildingIdRaw
    : org.buildings[0]?.id
  if (!buildingId) return { ok: false, error: "В организации нет активных зданий" }

  // Lead.contact = phone (или email если телефон пуст), notes = comment + email
  const notesParts: string[] = []
  if (comment) notesParts.push(comment)
  if (email) notesParts.push(`Email: ${email}`)

  await db.lead.create({
    data: {
      buildingId,
      name,
      contact: phone,
      contactType: "PHONE",
      notes: notesParts.length > 0 ? notesParts.join(" · ") : null,
      source: "PUBLIC_BOOKING",
      status: "NEW",
    },
  })

  revalidatePath("/admin/leads")
  return { ok: true }
}
