import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { notifyUser } from "@/lib/notify"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { releaseFoundersSlotIfExpired } from "@/lib/pricing"

export const dynamic = "force-dynamic"

// Запускается каждый день в 02:00 UTC = 08:00 Алматы
// Проверяет:
//   1. Организации с истёкшей подпиской → suspended
//   2. Организации за 30/7/3/1 день до истечения → уведомление (дедуп 22ч)
//   3. Founders-слоты приостановленных орг (60+ дней) → освобождение
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const now = new Date()
  const result = {
    suspended: 0,
    warnings: 0,
    foundersReleased: 0,
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

    // 2. Предупреждения за 30/7/3/1 день до истечения
    for (const days of [30, 7, 3, 1]) {
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

          const dayLabel = days === 1 ? "день" : days < 5 ? "дня" : "дней"
          const isLongHorizon = days >= 30
          await notifyUser({
            userId: org.ownerUserId,
            type: "SUBSCRIPTION_EXPIRING",
            title: isLongHorizon
              ? `Подписка истекает через ${days} ${dayLabel}`
              : `Подписка истекает через ${days} ${dayLabel}`,
            message: isLongHorizon
              ? `Подписка "${org.name}" заканчивается через месяц. Самое время выбрать тариф и период — для длительных периодов действуют скидки до 25%.`
              : `Подписка "${org.name}" истекает через ${days} ${dayLabel}. Свяжитесь с супер-админом для продления, иначе кабинет будет приостановлен.`,
            link: "/admin/subscription",
            emailButtonText: "Открыть подписку",
            // SMS только для горящих дедлайнов (T-3 и T-1).
            sendSms: days <= 3,
          })
          result.warnings++
        } catch { /* skip */ }
      }
    }
    // 3. Освобождение Founders-слотов у приостановленных орг (60+ дней).
    //    Помечаем slot свободным, чтобы программа продолжала работать.
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000)
    const stuckFounders = await db.organization.findMany({
      where: {
        isFoundersMember: true,
        isSuspended: true,
        updatedAt: { lte: sixtyDaysAgo },
      },
      select: { id: true, updatedAt: true },
    })
    for (const o of stuckFounders) {
      const days = Math.floor((now.getTime() - o.updatedAt.getTime()) / (24 * 3600 * 1000))
      try {
        const released = await releaseFoundersSlotIfExpired(o.id, days)
        if (released) result.foundersReleased++
      } catch (e) {
        result.errors.push(`founders.${o.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json({ ok: true, ...result, ranAt: now.toISOString() })
}
