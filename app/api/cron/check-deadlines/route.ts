import { NextResponse } from "next/server"
import { money } from "@/lib/money"
import { db } from "@/lib/db"
import { notifyUser } from "@/lib/notify"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { getT, getTForUser } from "@/lib/i18n/server"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"

export const dynamic = "force-dynamic"

const CONTRACT_WARN_DAYS = 20
const PAYMENT_WARN_DAYS = 10
const PENALTY_GRACE_DAYS = 1

/**
 * Уведомление читает получатель, а шлёт его ночной cron — cookie запроса тут
 * нет. Переводчик берём по языку из профиля каждого адресата и кешируем: за
 * один прогон один и тот же сотрудник упоминается десятки раз.
 */
type Translator = Awaited<ReturnType<typeof getT>>

async function translatorFor(cache: Map<string, Translator>, userId: string): Promise<Translator> {
  const cached = cache.get(userId)
  if (cached) return cached
  const tr = await getTForUser(userId)
  cache.set(userId, tr)
  return tr
}

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
  const row = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      space: { select: { floor: { select: { building: { select: { organizationId: true } } } } } },
      fullFloors: { select: { building: { select: { organizationId: true } } }, take: 1 },
    },
  })
  return row?.space?.floor.building.organizationId
    ?? row?.fullFloors[0]?.building.organizationId
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
    signRemindersSent: 0,
    notificationsCreated: 0,
    telegramSent: 0,
    errors: [] as string[],
  }

  const staffCache = new Map<string, { id: string; name: string; telegramChatId: string | null }[]>()
  const trCache = new Map<string, Translator>()

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
    for (const tenant of dueIndexation) {
      const pct = tenant.indexationPct ?? 0
      const factor = 1 + pct / 100
      const data: { customRate?: number; fixedMonthlyRent?: number; nextIndexationAt: Date } = {
        nextIndexationAt: new Date(new Date(tenant.nextIndexationAt!).setFullYear(tenant.nextIndexationAt!.getFullYear() + 1)),
      }
      // Ставка/сумма до и после — цифры одинаковы в любом языке, поэтому
      // подставляем их в шаблон, а фразу собирает словарь.
      let summaryFrom = 0
      let summaryTo = 0
      let summaryKind: "fixed" | "rate" | null = null
      if (typeof tenant.fixedMonthlyRent === "number" && tenant.fixedMonthlyRent > 0) {
        data.fixedMonthlyRent = money(tenant.fixedMonthlyRent * factor)
        summaryFrom = tenant.fixedMonthlyRent
        summaryTo = data.fixedMonthlyRent
        summaryKind = "fixed"
      } else if (typeof tenant.customRate === "number" && tenant.customRate > 0) {
        data.customRate = money(tenant.customRate * factor)
        summaryFrom = tenant.customRate
        summaryTo = data.customRate
        summaryKind = "rate"
      } else {
        // Аренда по ставке этажа — повышать нечего у арендатора. Сообщаем владельцу
        // и сдвигаем дату, чтобы не спамить каждый день.
        await db.tenant.update({ where: { id: tenant.id }, data: { nextIndexationAt: data.nextIndexationAt } })
        const orgId = await tenantOrgId(tenant.id)
        if (orgId) {
          for (const staff of await getStaffForOrg(staffCache, orgId)) {
            const { t } = await translatorFor(trCache, staff.id)
            await notifyUser({
              userId: staff.id,
              type: "BULK_INFO",
              title: t("emails.deadlines.indexationFloorRateTitle", { tenant: tenant.companyName }),
              message: t("emails.deadlines.indexationFloorRateMessage", { pct }),
              link: `/admin/tenants/${tenant.id}`,
            }).catch(() => {})
          }
        }
        continue
      }

      await db.tenant.update({ where: { id: tenant.id }, data } )
      results.indexationsApplied++

      const summaryFor = (tr: Translator) =>
        summaryKind === "fixed"
          ? tr.t("emails.deadlines.indexationSummaryFixed", {
              from: formatMoneyL(tr.locale, summaryFrom),
              to: formatMoneyL(tr.locale, summaryTo),
            })
          : tr.t("emails.deadlines.indexationSummaryRate", {
              from: formatMoneyL(tr.locale, summaryFrom),
              to: formatMoneyL(tr.locale, summaryTo),
            })

      const orgId = await tenantOrgId(tenant.id)
      if (orgId) {
        for (const staff of await getStaffForOrg(staffCache, orgId)) {
          const tr = await translatorFor(trCache, staff.id)
          await notifyUser({
            userId: staff.id,
            type: "BULK_INFO",
            title: tr.t("emails.deadlines.indexationStaffTitle", { tenant: tenant.companyName }),
            message: tr.t("emails.deadlines.indexationStaffMessage", {
              pct,
              summary: summaryFor(tr),
              date: formatDateShortL(tr.locale, data.nextIndexationAt),
            }),
            link: `/admin/tenants/${tenant.id}`,
          }).catch(() => {})
        }
      }
      // Арендатору — уведомление о повышении (договорное условие).
      const trTenant = await translatorFor(trCache, tenant.userId)
      await notifyUser({
        userId: tenant.userId,
        type: "BULK_INFO",
        title: trTenant.t("emails.deadlines.indexationTenantTitle"),
        message: trTenant.t("emails.deadlines.indexationTenantMessage", { pct, summary: summaryFor(trTenant) }),
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

    for (const tenant of tenantsExpiring) {
      if (!tenant.contractEnd) continue
      const daysLeft = Math.ceil((tenant.contractEnd.getTime() - now.getTime()) / 86_400_000)

      const recentNotif = await db.notification.findFirst({
        where: {
          type: "CONTRACT_EXPIRING",
          message: { contains: tenant.id },
          createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
        },
      })
      if (recentNotif) continue

      const link = `/admin/tenants/${tenant.id}`

      // Арендатору — in-app + Telegram + email
      const trTenant = await translatorFor(trCache, tenant.user.id)
      await notifyUser({
        userId: tenant.user.id,
        type: "CONTRACT_EXPIRING",
        title: trTenant.t("emails.deadlines.contractExpiringTenantTitle", { days: daysLeft }),
        message: trTenant.t("emails.deadlines.contractExpiringTenantMessage", {
          date: formatDateShortL(trTenant.locale, tenant.contractEnd),
        }),
        link: "/cabinet",
        emailButtonText: trTenant.t("emails.common.openCabinet"),
        // SMS убран: email+Telegram достаточно для не-срочных предупреждений.
        // SMS оставляем только для уже наступившей просрочки (см. блок ниже).
        sendSms: false,
      })
      results.notificationsCreated++
      if (tenant.user.telegramChatId) results.telegramSent++

      // Сотрудникам — in-app + Telegram (без email, чтобы не спамить инбокс
      // ежедневными напоминаниями про каждого арендатора).
      const orgId = await tenantOrgId(tenant.id)
      if (!orgId) continue
      const staffList = await getStaffForOrg(staffCache, orgId)
      for (const staff of staffList) {
        const tr = await translatorFor(trCache, staff.id)
        await notifyUser({
          userId: staff.id,
          type: "CONTRACT_EXPIRING",
          title: tr.t("emails.deadlines.contractExpiringStaffTitle", { days: daysLeft }),
          // id арендатора в тексте — по нему дедуп находит вчерашнее уведомление.
          message: tr.t("emails.deadlines.contractExpiringStaffMessage", {
            tenant: tenant.companyName,
            id: tenant.id,
            date: formatDateShortL(tr.locale, tenant.contractEnd),
          }),
          link,
          sendEmail: false,
        })
        results.notificationsCreated++
        if (staff.telegramChatId) results.telegramSent++
      }

      results.contractsWarned++
    }

    // ── 2. Платежи ──────────────────────────────────────────────
    // deletedAt: null — удалённые начисления не должны порождать ложные напоминания.
    const tenantsWithDebt = await db.tenant.findMany({
      where: { charges: { some: { isPaid: false, deletedAt: null } } },
      include: {
        user: { select: { id: true, name: true, telegramChatId: true } },
        charges: {
          where: { isPaid: false, deletedAt: null },
          select: { id: true, amount: true, type: true, period: true, dueDate: true },
        },
      },
    })

    for (const tenant of tenantsWithDebt) {
      const totalDebt = tenant.charges.reduce((sum, charge) => sum + charge.amount, 0)
      const earliestDue = tenant.charges
        .map((charge) => charge.dueDate)
        .filter((date): date is Date => date !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0]

      if (!earliestDue) continue
      const daysToDue = Math.ceil((earliestDue.getTime() - now.getTime()) / 86_400_000)

      if (daysToDue > PAYMENT_WARN_DAYS) continue

      const recentNotif = await db.notification.findFirst({
        where: {
          userId: tenant.user.id,
          type: "PAYMENT_DUE",
          createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
        },
      })
      if (recentNotif) continue

      const overdue = daysToDue < 0
      const trTenant = await translatorFor(trCache, tenant.user.id)
      const debtText = formatMoneyL(trTenant.locale, totalDebt)

      // Арендатору — in-app + Telegram + email + SMS (если просрочка)
      await notifyUser({
        userId: tenant.user.id,
        type: "PAYMENT_DUE",
        title: overdue
          ? trTenant.t("emails.deadlines.overdueTitle", { days: Math.abs(daysToDue) })
          : trTenant.t("emails.deadlines.dueSoonTitle", { days: daysToDue }),
        message: overdue
          ? trTenant.t("emails.deadlines.overdueMessage", { amount: debtText, percent: tenant.penaltyPercent })
          : trTenant.t("emails.deadlines.dueSoonMessage", {
              date: formatDateShortL(trTenant.locale, earliestDue),
              amount: debtText,
            }),
        link: "/cabinet/finances",
        emailButtonText: overdue
          ? trTenant.t("emails.deadlines.payNow")
          : trTenant.t("emails.deadlines.payGo"),
        sendSms: overdue,  // SMS только при реальной просрочке (платное)
      })
      results.notificationsCreated++
      if (tenant.user.telegramChatId) results.telegramSent++
      results.paymentsWarned++

      // Сотрудникам организации — при просрочке > 5 дней.
      // С email — это серьёзное событие (много долгов = риск).
      if (overdue && Math.abs(daysToDue) > 5) {
        const orgId = await tenantOrgId(tenant.id)
        if (!orgId) continue
        const staffList = await getStaffForOrg(staffCache, orgId)
        for (const staff of staffList) {
          const tr = await translatorFor(trCache, staff.id)
          await notifyUser({
            userId: staff.id,
            type: "PAYMENT_DUE",
            title: tr.t("emails.deadlines.staffOverdueTitle", { tenant: tenant.companyName }),
            message: tr.t("emails.deadlines.staffOverdueMessage", {
              tenant: tenant.companyName,
              amount: formatMoneyL(tr.locale, totalDebt),
              days: Math.abs(daysToDue),
            }),
            link: `/admin/tenants/${tenant.id}`,
            emailButtonText: tr.t("emails.deadlines.openTenantCard"),
          })
          results.notificationsCreated++
          if (staff.telegramChatId) results.telegramSent++
        }
      }
    }

    // ── 2b. Документы ждут подписи АРЕНДАТОРА: договор/ДС (SENT/VIEWED) и
    //        заявки на подпись (АВР/акт сверки). Напоминаем раз в 3 дня,
    //        начиная со 2-го дня ожидания (аудит 2026-06-10: автонапоминания).
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000)
    // Cursor-пагинация: не обрезаем хвост (notifyUser сам дедуплицирует 71ч)
    let contractCursor: string | undefined
    for (;;) {
      const batch = await db.contract.findMany({
        where: { deletedAt: null, status: { in: ["SENT", "VIEWED"] }, sentAt: { lt: twoDaysAgo } },
        select: {
          id: true,
          number: true,
          type: true,
          sentAt: true,
          tenant: { select: { userId: true } },
        },
        orderBy: { id: "asc" },
        take: 100,
        ...(contractCursor ? { skip: 1, cursor: { id: contractCursor } } : {}),
      })
      if (batch.length === 0) break
      for (const contract of batch) {
        const waitDays = contract.sentAt ? Math.floor((now.getTime() - contract.sentAt.getTime()) / 86_400_000) : 0
        const { t } = await translatorFor(trCache, contract.tenant.userId)
        const doc = contract.type === "ADDENDUM"
          ? t("emails.deadlines.docAddendum")
          : t("emails.deadlines.docContract")
        await notifyUser({
          userId: contract.tenant.userId,
          type: "DOCUMENT_SIGN_REQUEST",
          title: t("emails.deadlines.signContractTitle", { doc, number: contract.number ?? "—" }),
          message: t("emails.deadlines.signContractMessage", { doc, number: contract.number ?? "—", days: waitDays }),
          link: "/cabinet/documents",
          dedupWindowHours: 71, // не чаще раза в ~3 дня
        })
        results.signRemindersSent++
      }
      if (batch.length < 100) break
      contractCursor = batch[batch.length - 1].id
    }

    let requestCursor: string | undefined
    for (;;) {
      const batch = await db.documentSignatureRequest.findMany({
        where: { status: { in: ["PENDING", "VIEWED"] }, createdAt: { lt: twoDaysAgo } },
        select: { id: true, recipientUserId: true, title: true },
        orderBy: { id: "asc" },
        take: 100,
        ...(requestCursor ? { skip: 1, cursor: { id: requestCursor } } : {}),
      })
      if (batch.length === 0) break
      for (const request of batch) {
        const { t } = await translatorFor(trCache, request.recipientUserId)
        await notifyUser({
          userId: request.recipientUserId,
          type: "DOCUMENT_SIGN_REQUEST",
          title: t("emails.deadlines.signRequestTitle"),
          message: t("emails.deadlines.signRequestMessage", { title: request.title }),
          link: "/cabinet/documents",
          dedupWindowHours: 71,
        })
        results.signRemindersSent++
      }
      if (batch.length < 100) break
      requestCursor = batch[batch.length - 1].id
    }

    // ── 2c. Счёт/АВР без подписи ВЛАДЕЛЬЦА: автосозданные документы лежат в
    //        архиве, пока владелец не подпишет — после подписи уходят арендатору.
    //        Напоминаем владельцу и админам раз в 3 дня.
    const currentPeriodStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const periodDocs: Array<{ id: string; organizationId: string }> = []
    let docCursor: string | undefined
    for (;;) {
      const batch = await db.generatedDocument.findMany({
        where: {
          documentType: { in: ["INVOICE", "ACT"] },
          period: currentPeriodStr,
          deletedAt: null,
          generatedAt: { lt: twoDaysAgo },
        },
        select: { id: true, organizationId: true },
        orderBy: { id: "asc" },
        take: 100,
        ...(docCursor ? { skip: 1, cursor: { id: docCursor } } : {}),
      })
      periodDocs.push(...batch)
      if (batch.length < 100) break
      docCursor = batch[batch.length - 1].id
    }
    if (periodDocs.length > 0) {
      const signedDocIds = new Set(
        (await db.documentSignature.findMany({
          where: { documentType: { in: ["INVOICE", "ACT"] }, documentId: { in: periodDocs.map((d) => d.id) } },
          select: { documentId: true },
        })).map((signature) => signature.documentId).filter((x): x is string => !!x),
      )
      const unsignedByOrg = new Map<string, number>()
      for (const doc of periodDocs) {
        if (signedDocIds.has(doc.id)) continue
        unsignedByOrg.set(doc.organizationId, (unsignedByOrg.get(doc.organizationId) ?? 0) + 1)
      }
      for (const [orgId, count] of unsignedByOrg) {
        for (const staff of await getStaffForOrg(staffCache, orgId)) {
          const { t, tp } = await translatorFor(trCache, staff.id)
          await notifyUser({
            userId: staff.id,
            type: "DOCUMENT_SIGN_REQUEST",
            title: tp("emails.deadlines.ownerSignTitle", count),
            message: t("emails.deadlines.ownerSignMessage", { period: currentPeriodStr, count }),
            link: "/admin/documents",
            dedupWindowHours: 71,
          })
          results.signRemindersSent++
        }
      }
    }

    // ── 3. Пени (только для орг с фичей automatedFees) ──────
    // Префетч орг с включённой автопеней — фильтруем начисления по их арендаторам.
    const orgsForFees = await db.organization.findMany({
      where: { isActive: true, isSuspended: false },
      select: { id: true, penaltyGraceDays: true, plan: { select: { features: true } } },
    })
    const autoFeesOrgIds = new Set<string>()
    const orgGraceMap = new Map<string, number>()
    for (const org of orgsForFees) {
      orgGraceMap.set(org.id, typeof org.penaltyGraceDays === "number" ? org.penaltyGraceDays : PENALTY_GRACE_DAYS)
      try {
        const features = JSON.parse(org.plan?.features ?? "{}") as { automatedFees?: boolean }
        if (features?.automatedFees === true) autoFeesOrgIds.add(org.id)
      } catch { /* битый json — пропуск */ }
    }

    // Рассрочка: если по активному плану есть просроченный неоплаченный взнос —
    // план сорван. Возвращаем покрытые начисления под пеню (зануляем ссылку) и
    // помечаем план BROKEN. Делаем ДО начисления пени, чтобы пеня сразу пошла.
    const graceDate = new Date(now.getTime() - PENALTY_GRACE_DAYS * 24 * 3600 * 1000)
    const brokenPlans = await db.debtInstallmentPlan.findMany({
      where: {
        status: "ACTIVE",
        installments: { some: { isPaid: false, dueDate: { lt: graceDate } } },
      },
      select: { id: true },
    })
    if (brokenPlans.length > 0) {
      const brokenIds = brokenPlans.map((plan) => plan.id)
      await db.charge.updateMany({ where: { installmentPlanId: { in: brokenIds } }, data: { installmentPlanId: null } })
      await db.debtInstallmentPlan.updateMany({ where: { id: { in: brokenIds } }, data: { status: "BROKEN" } })
    }

    const overdueCharges = await db.charge.findMany({
      where: {
        isPaid: false,
        // Пеня начисляется только на АРЕНДУ/УСЛУГИ. Депозит (разовая гарантия) и сама
        // пеня пеней не облагаются — иначе просроченный депозит «накручивал» пеню.
        type: { notIn: ["PENALTY", "DEPOSIT", "DEPOSIT_REFUND"] },
        // Начисления в действующей рассрочке пеней не облагаются.
        installmentPlanId: null,
        // Пеня по начислению отменена админом вручную (waivePenalty) — пропускаем.
        penaltyWaived: false,
        // Все просроченные (льготный период применяется по организации в цикле ниже).
        dueDate: { lt: now },
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

    for (const charge of overdueCharges) {
      if (!charge.dueDate) continue
      // Gate: автопеня только для орг с фичей automatedFees (Starter+).
      const orgId = charge.tenant.user?.organizationId
      if (!orgId || !autoFeesOrgIds.has(orgId)) continue
      // Льготный период — из настроек организации (fallback на дефолт).
      const graceDays = orgGraceMap.get(orgId) ?? PENALTY_GRACE_DAYS
      const daysOverdue = Math.floor((now.getTime() - charge.dueDate.getTime()) / 86_400_000) - graceDays
      if (daysOverdue <= 0) continue

      const penaltyPercent = charge.tenant.penaltyPercent ?? 1
      const penaltyAmount = Math.round((charge.amount * penaltyPercent / 100) * daysOverdue)
      const cap = Math.round(charge.amount * 0.1)

      // Идемпотентность «раз в день» — по дате создания (не по period, т.к. период
      // пени теперь = месяц исходного начисления, а не сегодняшняя дата).
      const startOfToday = new Date(now)
      startOfToday.setHours(0, 0, 0, 0)
      const existingPenaltyToday = await db.charge.findFirst({
        where: {
          tenantId: charge.tenant.id,
          type: "PENALTY",
          createdAt: { gte: startOfToday },
          description: { contains: charge.id },
        },
      })
      if (existingPenaltyToday) continue

      // Уже ОПЛАЧЕННЫЕ пени по этому начислению вычитаем из накопительной суммы —
      // иначе оплативший пеню арендатор на следующий день получит её заново целиком
      // (аудит 2026-06-10, п.3).
      const paidPenalties = await db.charge.aggregate({
        where: {
          tenantId: charge.tenant.id,
          type: "PENALTY",
          isPaid: true,
          deletedAt: null,
          description: { contains: charge.id },
        },
        _sum: { amount: true },
      })
      const alreadyPaid = Math.round(paidPenalties._sum.amount ?? 0)
      const actualPenalty = Math.min(penaltyAmount, cap) - alreadyPaid
      if (actualPenalty <= 0) continue

      await db.charge.deleteMany({
        where: {
          tenantId: charge.tenant.id,
          type: "PENALTY",
          isPaid: false,
          description: { contains: charge.id },
        },
      })

      // Описание начисления читает арендатор в своём кабинете — пишем его на
      // языке арендатора. id исходного начисления остаётся в тексте: по нему
      // задача на следующий день находит уже начисленную пеню.
      const trTenant = await translatorFor(trCache, charge.tenant.userId)
      const paidPart = alreadyPaid > 0
        ? trTenant.t("emails.deadlines.penaltyPaidPart", { amount: formatMoneyL(trTenant.locale, alreadyPaid) })
        : ""

      await db.charge.create({
        data: {
          tenantId: charge.tenant.id,
          // Период пени = месяц просроченного начисления (чтобы пеня была видна и
          // отменяема в том же месяце, что и долг; раньше был today → пеня «терялась»).
          period: charge.period,
          type: "PENALTY",
          amount: actualPenalty,
          description: trTenant.t("emails.deadlines.penaltyDescription", {
            id: charge.id,
            days: daysOverdue,
            percent: penaltyPercent,
            paid: paidPart,
          }),
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
