import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { notifyUser } from "@/lib/notify"
import { authorizeCronRequest } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

// Запускается каждый день в 02:00 UTC = 08:00 Алматы
// Проверяет: организации с истёкшей подпиской → suspended
//            организации за 7-3-1 день до истечения → уведомление
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const now = new Date()
  const result = {
    suspended: 0,
    warnings: 0,
    errors: [] as string[],
  }

  try {
    // 1. Истекшие подписки → suspended
    const expired = await db.organization.findMany({
      where: {
        isActive: true,
        isSuspended: false,
        planExpiresAt: { lt: now },
      },
      select: { id: true, name: true, ownerUserId: true },
    })

    for (const org of expired) {
      await db.organization.update({
        where: { id: org.id },
        data: { isSuspended: true },
      })
      result.suspended++

      // Уведомить владельца — in-app + email + telegram
      if (org.ownerUserId) {
        await notifyUser({
          userId: org.ownerUserId,
          type: "SUBSCRIPTION_EXPIRED",
          title: `Подписка истекла`,
          message: `Подписка организации "${org.name}" истекла. Кабинет приостановлен. Свяжитесь с администрацией для продления.`,
          link: "/admin/subscription",
          emailButtonText: "Продлить подписку",
        })
      }
    }

    // 2. Предупреждения за 7/3/1 день до истечения
    for (const days of [7, 3, 1]) {
      const target = new Date(now)
      target.setDate(target.getDate() + days)
      const startOfDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
      const endOfDay = new Date(startOfDay)
      endOfDay.setDate(endOfDay.getDate() + 1)

      const orgs = await db.organization.findMany({
        where: {
          isActive: true,
          isSuspended: false,
          planExpiresAt: { gte: startOfDay, lt: endOfDay },
        },
        select: { id: true, name: true, ownerUserId: true },
      })

      for (const org of orgs) {
        if (!org.ownerUserId) continue
        try {
          // Дедуп — не более одного уведомления этого типа за 22 часа
          const existing = await db.notification.findFirst({
            where: {
              userId: org.ownerUserId,
              type: "SUBSCRIPTION_EXPIRING",
              title: { contains: `${days} дн.` },
              createdAt: { gte: new Date(now.getTime() - 22 * 3600 * 1000) },
            },
          })
          if (existing) continue

          await notifyUser({
            userId: org.ownerUserId,
            type: "SUBSCRIPTION_EXPIRING",
            title: `Подписка истекает через ${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}`,
            message: `Подписка организации "${org.name}" истекает через ${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}. Продлите чтобы избежать приостановки.`,
            link: "/admin/subscription",
            emailButtonText: "Продлить подписку",
          })
          result.warnings++
        } catch { /* skip */ }
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json({ ok: true, ...result, ranAt: now.toISOString() })
}
