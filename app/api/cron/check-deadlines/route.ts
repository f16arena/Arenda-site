import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { notifyUser } from "@/lib/notify"
import { authorizeCronRequest } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

const CONTRACT_WARN_DAYS = 20
const PAYMENT_WARN_DAYS = 10
const PENALTY_GRACE_DAYS = 1

// Кэш: orgId → staff list (чтобы не тащить из БД на каждого арендатора)
async function getStaffForOrg(cache: Map<string, { id: string; name: string; telegramChatId: string | null }[]>, orgId: string) {
  const cached = cache.get(orgId)
  if (cached) return cached
  const list = await db.user.findMany({
    where: {
      isActive: true,
      role: { in: ["OWNER", "ADMIN"] },
      organizationId: orgId,
    },
    select: { id: true, name: true, telegramChatId: true },
  })
  cache.set(orgId, list)
  return list
}

// Возвращает orgId арендатора через цепочку space → floor → building.
async function tenantOrgId(tenantId: string): Promise<string | null> {
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      space: { select: { floor: { select: { building: { select: { organizationId: true } } } } } },
      fullFloors: { select: { building: { select: { organizationId: true } } }, take: 1 },
    },
  })
  return t?.space?.floor.building.organizationId
    ?? t?.fullFloors[0]?.building.organizationId
    ?? null
}

export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const now = new Date()
  const results = {
    contractsChecked: 0,
    contractsWarned: 0,
    paymentsWarned: 0,
    penaltiesAccrued: 0,
    penaltiesAmount: 0,
    indexationsApplied: 0,
    notificationsCreated: 0,
    telegramSent: 0,
    errors: [] as string[],
  }

  const staffCache = new Map<string, { id: string; name: string; telegramChatId: string | null }[]>()

  // ── 0. Индексация аренды: в дату nextIndexationAt повышаем ставку/сумму на
  //       indexationPct % и сдвигаем дату на год вперёд (аудит 2026-06-10, п.14).
  try {
    const dueIndexation = await db.tenant.findMany({
      where: {
        deletedAt: null,
        indexationPct: { gt: 0 },
        nextIndexationAt: { lte: now },
      },
      select: {
        id: true,
        companyName: true,
        userId: true,
        customRate: true,
        fixedMonthlyRent: true,
        indexationPct: true,
        nextIndexationAt: true,
      },
    })
    for (const t of dueIndexation) {
      const pct = t.indexationPct ?? 0
      const factor = 1 + pct / 100
      const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
      const data: { customRate?: number; fixedMonthlyRent?: number; nextIndexationAt: Date } = {
        nextIndexationAt: new Date(new Date(t.nextIndexationAt!).setFullYear(t.nextIndexationAt!.getFullYear() + 1)),
      }
      let summary = ""
      if (typeof t.fixedMonthlyRent === "number" && t.fixedMonthlyRent > 0) {
        data.fixedMonthlyRent = round2(t.fixedMonthlyRent * factor)
        summary = `аренда ${t.fixedMonthlyRent.toLocaleString("ru-RU")} → ${data.fixedMonthlyRent.toLocaleString("ru-RU")} ₸/мес`
      } else if (typeof t.customRate === "number" && t.customRate > 0) {
        data.customRate = round2(t.customRate * factor)
        summary = `ставка ${t.customRate.toLocaleString("ru-RU")} → ${data.customRate.toLocaleString("ru-RU")} ₸/м²`
      } else {
        // Аренда по ставке этажа — повышать нечего у арендатора. Сообщаем владельцу
        // и сдвигаем дату, чтобы не спамить каждый день.
        await db.tenant.update({ where: { id: t.id }, data: { nextIndexationAt: data.nextIndexationAt } })
        const orgId = await tenantOrgId(t.id)
        if (orgId) {
          for (const staff of await getStaffForOrg(staffCache, orgId)) {
            await notifyUser({
              userId: staff.id,
              type: "BULK_INFO",
              title: `Индексация «${t.companyName}»: ставка этажная`,
              message: `У арендатора настроена индексация ${pct}%/год, но аренда считается по ставке этажа. Повысьте ставку этажа вручную или задайте индивидуальную ставку.`,
              link: `/admin/tenants/${t.id}`,
            }).catch(() => {})
          }
        }
        continue
      }

      await db.tenant.update({ where: { id: t.id }, data } )
      results.indexationsApplied++

      const orgId = await tenantOrgId(t.id)
      if (orgId) {
        for (const staff of await getStaffForOrg(staffCache, orgId)) {
          await notifyUser({
            userId: staff.id,
            type: "BULK_INFO",
            title: `Индексация аренды: ${t.companyName}`,
            message: `Применена индексация ${pct}%: ${summary}. Следующая — ${data.nextIndexationAt.toLocaleDateString("ru-RU")}. Новая сумма попадёт в начисления со следующего месяца.`,
            link: `/admin/tenants/${t.id}`,
          }).catch(() => {})
        }
      }
      // Арендатору — уведомление о повышении (договорное условие).
      await notifyUser({
        userId: t.userId,
        type: "BULK_INFO",
        title: "Индексация арендной платы",
        message: `Согласно условиям договора применена ежегодная индексация ${pct}%: ${summary}.`,
        link: "/cabinet/finances",
      }).catch(() => {})
    }
  } catch (e) {
    results.errors.push(`indexation: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    // ── 1. Договоры — проверяем contractEnd ─────────────────────
    const expiringIn = new Date(now)
    expiringIn.setDate(expiringIn.getDate() + CONTRACT_WARN_DAYS)

    const tenantsExpiring = await db.tenant.findMany({
      where: {
        contractEnd: { gte: now, lte: expiringIn },
      },
      include: {
        user: { select: { id: true, name: true, telegramChatId: true } },
        space: { select: { number: true, floor: { select: { name: true } } } },
      },
    })
    results.contractsChecked = tenantsExpiring.length

    for (const t of tenantsExpiring) {
      if (!t.contractEnd) continue
      const daysLeft = Math.ceil((t.contractEnd.getTime() - now.getTime()) / 86_400_000)

      const recentNotif = await db.notification.findFirst({
        where: {
          type: "CONTRACT_EXPIRING",
          message: { contains: t.id },
          createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
        },
      })
      if (recentNotif) continue

      const title = `Договор истекает через ${daysLeft} дн.`
      const message = `Арендатор «${t.companyName}» (id:${t.id}). Окончание договора: ${t.contractEnd.toLocaleDateString("ru-RU")}. Необходимо подготовить продление.`
      const link = `/admin/tenants/${t.id}`

      // Арендатору — in-app + Telegram + email + SMS (если контракт истекает <= 7 дней)
      await notifyUser({
        userId: t.user.id,
        type: "CONTRACT_EXPIRING",
        title: `Ваш договор истекает через ${daysLeft} дн.`,
        message: `Договор аренды истекает ${t.contractEnd.toLocaleDateString("ru-RU")}. Свяжитесь с администрацией для продления.`,
        link: "/cabinet",
        emailButtonText: "Открыть кабинет",
        // SMS убран: email+Telegram достаточно для не-срочных предупреждений.
        // SMS оставляем только для уже наступившей просрочки (см. блок ниже).
        sendSms: false,
      })
      results.notificationsCreated++
      if (t.user.telegramChatId) results.telegramSent++

      // Сотрудникам — in-app + Telegram (без email, чтобы не спамить инбокс
      // ежедневными напоминаниями про каждого арендатора).
      const orgId = await tenantOrgId(t.id)
      if (!orgId) continue
      const staff = await getStaffForOrg(staffCache, orgId)
      for (const s of staff) {
        await notifyUser({
          userId: s.id,
          type: "CONTRACT_EXPIRING",
          title,
          message,
          link,
          sendEmail: false,
        })
        results.notificationsCreated++
        if (s.telegramChatId) results.telegramSent++
      }

      results.contractsWarned++
    }

    // ── 2. Платежи ──────────────────────────────────────────────
    const tenantsWithDebt = await db.tenant.findMany({
      where: { charges: { some: { isPaid: false } } },
      include: {
        user: { select: { id: true, name: true, telegramChatId: true } },
        charges: {
          where: { isPaid: false },
          select: { id: true, amount: true, type: true, period: true, dueDate: true },
        },
      },
    })

    for (const t of tenantsWithDebt) {
      const totalDebt = t.charges.reduce((s, c) => s + c.amount, 0)
      const earliestDue = t.charges
        .map((c) => c.dueDate)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0]

      if (!earliestDue) continue
      const daysToDue = Math.ceil((earliestDue.getTime() - now.getTime()) / 86_400_000)

      if (daysToDue > PAYMENT_WARN_DAYS) continue

      const recentNotif = await db.notification.findFirst({
        where: {
          userId: t.user.id,
          type: "PAYMENT_DUE",
          createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
        },
      })
      if (recentNotif) continue

      const overdue = daysToDue < 0
      const title = overdue
        ? `Просрочка оплаты ${Math.abs(daysToDue)} дн.`
        : `Оплата через ${daysToDue} дн.`
      const message = overdue
        ? `У вас просроченная задолженность ${totalDebt.toLocaleString("ru-RU")} ₸. Начисляется пеня ${t.penaltyPercent}% в день.`
        : `Не забудьте оплатить аренду до ${earliestDue.toLocaleDateString("ru-RU")}. Сумма к оплате: ${totalDebt.toLocaleString("ru-RU")} ₸.`

      // Арендатору — in-app + Telegram + email + SMS (если просрочка)
      await notifyUser({
        userId: t.user.id,
        type: "PAYMENT_DUE",
        title,
        message,
        link: "/cabinet/finances",
        emailButtonText: overdue ? "Оплатить срочно" : "Перейти к оплате",
        sendSms: overdue,  // SMS только при реальной просрочке (платное)
      })
      results.notificationsCreated++
      if (t.user.telegramChatId) results.telegramSent++
      results.paymentsWarned++

      // Сотрудникам организации — при просрочке > 5 дней.
      // С email — это серьёзное событие (много долгов = риск).
      if (overdue && Math.abs(daysToDue) > 5) {
        const orgId = await tenantOrgId(t.id)
        if (!orgId) continue
        const staff = await getStaffForOrg(staffCache, orgId)
        for (const s of staff) {
          await notifyUser({
            userId: s.id,
            type: "PAYMENT_DUE",
            title: `Просрочка: ${t.companyName}`,
            message: `Арендатор «${t.companyName}» не оплатил ${totalDebt.toLocaleString("ru-RU")} ₸ (${Math.abs(daysToDue)} дн. просрочки).`,
            link: `/admin/tenants/${t.id}`,
            emailButtonText: "Открыть карточку арендатора",
          })
          results.notificationsCreated++
          if (s.telegramChatId) results.telegramSent++
        }
      }
    }

    // ── 3. Пени (только для орг с фичей automatedFees) ──────
    const todayStr = now.toISOString().slice(0, 10)
    // Префетч орг с включённой автопеней — фильтруем начисления по их арендаторам.
    const orgsForFees = await db.organization.findMany({
      where: { isActive: true, isSuspended: false },
      select: { id: true, plan: { select: { features: true } } },
    })
    const autoFeesOrgIds = new Set<string>()
    for (const o of orgsForFees) {
      try {
        const f = JSON.parse(o.plan?.features ?? "{}") as { automatedFees?: boolean }
        if (f?.automatedFees === true) autoFeesOrgIds.add(o.id)
      } catch { /* битый json — пропуск */ }
    }

    const overdueCharges = await db.charge.findMany({
      where: {
        isPaid: false,
        type: { not: "PENALTY" },
        dueDate: { lt: new Date(now.getTime() - PENALTY_GRACE_DAYS * 24 * 3600 * 1000) },
      },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        type: true,
        period: true,
        tenant: {
          select: {
            id: true,
            companyName: true,
            penaltyPercent: true,
            userId: true,
            user: { select: { organizationId: true } },
          },
        },
      },
    })

    for (const c of overdueCharges) {
      if (!c.dueDate) continue
      // Gate: автопеня только для орг с фичей automatedFees (Starter+).
      const orgId = c.tenant.user?.organizationId
      if (!orgId || !autoFeesOrgIds.has(orgId)) continue
      const daysOverdue = Math.floor((now.getTime() - c.dueDate.getTime()) / 86_400_000) - PENALTY_GRACE_DAYS
      if (daysOverdue <= 0) continue

      const penaltyPercent = c.tenant.penaltyPercent ?? 1
      const penaltyAmount = Math.round((c.amount * penaltyPercent / 100) * daysOverdue)
      const cap = Math.round(c.amount * 0.1)

      const existingPenaltyToday = await db.charge.findFirst({
        where: {
          tenantId: c.tenant.id,
          type: "PENALTY",
          period: todayStr,
          description: { contains: c.id },
        },
      })
      if (existingPenaltyToday) continue

      // Уже ОПЛАЧЕННЫЕ пени по этому начислению вычитаем из накопительной суммы —
      // иначе оплативший пеню арендатор на следующий день получит её заново целиком
      // (аудит 2026-06-10, п.3).
      const paidPenalties = await db.charge.aggregate({
        where: {
          tenantId: c.tenant.id,
          type: "PENALTY",
          isPaid: true,
          deletedAt: null,
          description: { contains: c.id },
        },
        _sum: { amount: true },
      })
      const alreadyPaid = Math.round(paidPenalties._sum.amount ?? 0)
      const actualPenalty = Math.min(penaltyAmount, cap) - alreadyPaid
      if (actualPenalty <= 0) continue

      await db.charge.deleteMany({
        where: {
          tenantId: c.tenant.id,
          type: "PENALTY",
          isPaid: false,
          description: { contains: c.id },
        },
      })

      await db.charge.create({
        data: {
          tenantId: c.tenant.id,
          period: todayStr,
          type: "PENALTY",
          amount: actualPenalty,
          description: `Пеня по начислению ${c.id} (${daysOverdue} дн. × ${penaltyPercent}%, не более 10%${alreadyPaid > 0 ? `, оплачено ранее ${alreadyPaid}` : ""})`,
          dueDate: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
        },
      })
      results.penaltiesAccrued++
      results.penaltiesAmount += actualPenalty
    }
  } catch (e) {
    results.errors.push(e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json({ ok: true, ...results, ranAt: now.toISOString() })
}
