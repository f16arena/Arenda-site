import "server-only"
import { db } from "@/lib/db"
import { notifyUser } from "@/lib/notify"

/**
 * Заявка на аренду от будущего арендатора (форма бронирования, витрина здания).
 * Отдельной CRM-страницы нет (владелец решил 19.09.2026, что она не нужна),
 * поэтому заявка сразу приходит людям: владельцам организации и администратору
 * здания — в колокольчик, на почту и в Telegram. Запись Lead в базе остаётся
 * как архив.
 */
export async function notifyRentalInquiry(input: {
  buildingId: string
  name: string
  contact: string
  /** Какое помещение, комментарий, email */
  details: string | null
  source: "бронирования" | "витрины здания"
}): Promise<void> {
  const building = await db.building.findUnique({
    where: { id: input.buildingId },
    select: { name: true, organizationId: true, administratorUserId: true },
  })
  if (!building) return

  const owners = await db.user.findMany({
    where: { organizationId: building.organizationId, isActive: true, role: "OWNER" },
    select: { id: true },
  })
  const recipients = new Set(owners.map((u) => u.id))
  if (building.administratorUserId) recipients.add(building.administratorUserId)

  const message = [
    `${input.name}, ${input.contact}`,
    `Здание: ${building.name}`,
    input.details,
    `Пришла с формы ${input.source}. Свяжитесь с клиентом.`,
  ].filter(Boolean).join("\n")

  await Promise.all(
    [...recipients].map((userId) =>
      notifyUser({
        userId,
        type: "RENTAL_INQUIRY",
        title: "Новая заявка на аренду",
        message,
        link: "/admin/spaces",
        emailButtonText: "Открыть помещения",
      }).catch(() => undefined),
    ),
  )
}
