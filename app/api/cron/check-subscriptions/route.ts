import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { notifyUser } from "@/lib/notify"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { releaseFoundersSlotIfExpired } from "@/lib/pricing"
import { getTForUser } from "@/lib/i18n/server"
import { formatMoneyL } from "@/lib/i18n/format"

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
    foundingGraceSkipped: 0,
    foundersReleased: 0,
    errors: [] as string[],
  }
  // Founding Members получают 7 дней grace period перед suspension.
  const FOUNDING_GRACE_DAYS = 7
  const graceCutoff = new Date(now.getTime() - FOUNDING_GRACE_DAYS * 24 * 3600 * 1000)

  try {
    // 1. Истекшие подписки → suspended
    //    Founding Members: 7 дней grace period. Если planExpiresAt в окне
    //    [now-7д ... now] И is Founding — пропускаем, шлём напоминание.
    const expired = await db.organization.findMany({
      where: {
        isActive: true,
        isSuspended: false,
        planExpiresAt: { lt: now },
      },
      select: { id: true, name: true, ownerUserId: true, isFoundersMember: true, planExpiresAt: true },
    })

    for (const org of expired) {
      const inGrace = org.isFoundersMember && org.planExpiresAt !== null && org.planExpiresAt >= graceCutoff
      if (inGrace) {
        result.foundingGraceSkipped++
        // Мягкое напоминание (без suspension) — дедуп через Notification.
        if (org.ownerUserId) {
          const existing = await db.notification.findFirst({
            where: {
              userId: org.ownerUserId,
              type: "SUBSCRIPTION_FOUNDING_GRACE",
              createdAt: { gte: new Date(now.getTime() - 22 * 3600 * 1000) },
            },
          })
          if (!existing) {
            // Письмо читает владелец организации — язык из его профиля.
            const { t } = await getTForUser(org.ownerUserId)
            await notifyUser({
              userId: org.ownerUserId,
              type: "SUBSCRIPTION_FOUNDING_GRACE",
              title: t("emails.subscription.foundingGraceTitle"),
              message: t("emails.subscription.foundingGraceMessage", { org: org.name }),
              link: "/admin/subscription",
              emailButtonText: t("emails.subscription.openButton"),
            }).catch(() => null)
          }
        }
        continue
      }

      await db.organization.update({
        where: { id: org.id },
        data: { isSuspended: true },
      })
      result.suspended++

      // Уведомить владельца — in-app + email + telegram
      if (org.ownerUserId) {
        const { t } = await getTForUser(org.ownerUserId)
        await notifyUser({
          userId: org.ownerUserId,
          type: "SUBSCRIPTION_EXPIRED",
          title: t("emails.subscription.expiredTitle"),
          message: t("emails.subscription.expiredMessage", { org: org.name }),
          link: "/admin/subscription",
          emailButtonText: t("emails.subscription.renewButton"),
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
          // Дедуп — не более одного уведомления этого типа за 22 часа.
          // Раньше искали в заголовке подстроку «N дн.»: заголовок переводится,
          // и поиск по русскому тексту перестал бы находить своё же уведомление.
          // Проверка по типу достаточна: planExpiresAt попадает ровно в один
          // горизонт (30/7/3/1) за прогон, двух писем в сутки быть не может.
          const existing = await db.notification.findFirst({
            where: {
              userId: org.ownerUserId,
              type: "SUBSCRIPTION_EXPIRING",
              createdAt: { gte: new Date(now.getTime() - 22 * 3600 * 1000) },
            },
          })
          if (existing) continue

          const isLongHorizon = days >= 30
          const { t, tp } = await getTForUser(org.ownerUserId)
          await notifyUser({
            userId: org.ownerUserId,
            type: "SUBSCRIPTION_EXPIRING",
            title: tp("emails.subscription.expiringTitle", days),
            message: isLongHorizon
              ? t("emails.subscription.expiringMonthMessage", { org: org.name })
              : tp("emails.subscription.expiringMessage", days, { org: org.name }),
            link: "/admin/subscription",
            emailButtonText: t("emails.subscription.openButton"),
            // SMS убран для SUBSCRIPTION_EXPIRING — email + Telegram достаточны.
            // SMS оставлен только для SUBSCRIPTION_EXPIRED (уже истекло) — см. блок выше.
            sendSms: false,
          })
          result.warnings++
        } catch { /* skip */ }
      }
    }
    // 3. Годовая индексация эксплуатационного сбора по зданиям.
    //    Раз в год (если прошло ≥365 дней с serviceFeeLastIndexedAt) — умножаем
    //    зимний и летний тарифы на (1 + pct/100), сохраняем дату.
    //    Если LastIndexedAt не задан — считаем от первой установки тарифа (createdAt).
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 3600 * 1000)
    const buildingsToIndex = await db.building.findMany({
      where: {
        isActive: true,
        serviceFeeWinterRate: { not: null },
        serviceFeeSummerRate: { not: null },
        serviceFeeIndexationPct: { gt: 0 },
        OR: [
          { serviceFeeLastIndexedAt: { lte: oneYearAgo } },
          { AND: [{ serviceFeeLastIndexedAt: null }, { createdAt: { lte: oneYearAgo } }] },
        ],
      },
      select: {
        id: true, name: true,
        organizationId: true,
        serviceFeeWinterRate: true,
        serviceFeeSummerRate: true,
        serviceFeeIndexationPct: true,
      },
    })
    let serviceFeeIndexedCount = 0
    for (const b of buildingsToIndex) {
      const factor = 1 + (b.serviceFeeIndexationPct ?? 10) / 100
      const newWinter = Math.round((b.serviceFeeWinterRate ?? 0) * factor)
      const newSummer = Math.round((b.serviceFeeSummerRate ?? 0) * factor)
      try {
        await db.building.update({
          where: { id: b.id },
          data: {
            serviceFeeWinterRate: newWinter,
            serviceFeeSummerRate: newSummer,
            serviceFeeLastIndexedAt: now,
          },
        })
        serviceFeeIndexedCount++
        // Уведомим владельца организации.
        const org = await db.organization.findUnique({
          where: { id: b.organizationId },
          select: { ownerUserId: true, name: true },
        })
        if (org?.ownerUserId) {
          const { t, locale } = await getTForUser(org.ownerUserId)
          await notifyUser({
            userId: org.ownerUserId,
            type: "SERVICE_FEE_INDEXED",
            title: t("emails.subscription.serviceFeeIndexedTitle", { building: b.name }),
            message: t("emails.subscription.serviceFeeIndexedMessage", {
              building: b.name,
              pct: b.serviceFeeIndexationPct ?? 10,
              winterFrom: formatMoneyL(locale, b.serviceFeeWinterRate ?? 0),
              winterTo: formatMoneyL(locale, newWinter),
              summerFrom: formatMoneyL(locale, b.serviceFeeSummerRate ?? 0),
              summerTo: formatMoneyL(locale, newSummer),
            }),
            link: `/admin/buildings/${b.id}/service-fee`,
            sendEmail: false,
          }).catch(() => null)
        }
      } catch (e) {
        result.errors.push(`service-fee.${b.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // Запишем счётчик в JSON ответа (поле создадим динамически).
    ;(result as Record<string, unknown>).serviceFeeIndexed = serviceFeeIndexedCount

    // 4. Освобождение Founders-слотов у приостановленных орг (60+ дней).
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

  // 5. Сбрасываем admin-shell-cache: cron поменял isSuspended/foundersSlot/тарифы
  //    — клиенту админка не должна показывать устаревшее ещё 60 сек.
  //    revalidateTag из cron не работает в serverless, поэтому дёргаем endpoint.
  if (result.suspended > 0 || result.foundersReleased > 0 || (result as Record<string, unknown>).serviceFeeIndexed) {
    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL}`
      : null
    if (base && process.env.CRON_SECRET) {
      await fetch(`${base}/api/admin/cache/invalidate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.CRON_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tag: "admin-shell" }),
      }).catch((e) => result.errors.push(`cache-invalidate: ${e instanceof Error ? e.message : String(e)}`))
    }
  }

  return NextResponse.json({ ok: true, ...result, ranAt: now.toISOString() })
}
