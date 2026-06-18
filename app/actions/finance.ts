"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { generateMonthlyInvoicesForOrg } from "@/lib/monthly-documents"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { tenantScope, chargeScope, paymentScope } from "@/lib/tenant-scope"
import { recordPaymentCash, reversePaymentCash, reapplyPaymentCash } from "@/lib/payment-cash"
import { applyTenantCreditToCharges } from "@/lib/tenant-credit"
import { notifyUser } from "@/lib/notify"
import { CHARGE_TYPES } from "@/lib/utils"
import { calculateTenantRentChargeForPeriod, getTenantRentChargeDescription } from "@/lib/rent"
import { formatTenantPlacement } from "@/lib/tenant-placement"
import {
  getServiceChargeDescription,
  isServiceChargeType,
  SERVICE_CHARGE_TYPE_VALUES,
} from "@/lib/service-charges"
import {
  assertTenantInOrg,
  assertChargeInOrg,
  assertPaymentInOrg,
  assertExpenseInOrg,
} from "@/lib/scope-guards"
import { assertBuildingAccess, assertTenantBuildingAccess, getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { PaymentCreateSchema, firstZodError } from "@/lib/schemas"
import { isUniqueConstraintError } from "@/lib/prisma-errors"
import type { Prisma } from "@/app/generated/prisma/client"

function parseChargeAmount(value: FormDataEntryValue | null) {
  const amount = Number(String(value ?? "").trim().replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100) / 100
}

function parsePeriod(value: FormDataEntryValue | null) {
  const period = String(value ?? "").trim()
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : null
}

function parseDateOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const date = new Date(`${raw}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function recordPayment(formData: FormData) {
  await requireCapabilityAndFeature("finance.recordPayment")
  const { orgId } = await requireOrgAccess()

  // Валидация формы через Zod-схему. Пустые значения формы не должны попадать
  // в Zod как "" — приводим их к undefined чтобы оптиональные поля прошли.
  const rawTenantId = formData.get("tenantId")
  const rawAmount = formData.get("amount")
  const rawMethod = formData.get("method")
  const rawDate = formData.get("paymentDate")
  const rawNote = formData.get("note")

  const parsed = PaymentCreateSchema.safeParse({
    tenantId: typeof rawTenantId === "string" ? rawTenantId : "",
    amount: rawAmount != null && String(rawAmount).trim() !== "" ? Number(rawAmount) : NaN,
    method: typeof rawMethod === "string" && rawMethod ? rawMethod : "TRANSFER",
    paymentDate:
      typeof rawDate === "string" && rawDate.trim() !== "" ? rawDate : undefined,
    note: typeof rawNote === "string" && rawNote.trim() !== "" ? rawNote : undefined,
  })
  if (!parsed.success) {
    throw new Error(firstZodError(parsed.error))
  }

  const { tenantId, amount, method, paymentDate, note } = parsed.data
  await assertTenantInOrg(tenantId, orgId)
  await assertTenantBuildingAccess(tenantId, orgId)

  const chargeIds = formData.getAll("chargeIds") as string[]
  // Опционально: на какой счёт пришли деньги (банк/касса/карта).
  // Если указан — автоматически создаём транзакцию и увеличиваем баланс.
  const cashAccountId = (formData.get("cashAccountId") as string)?.trim() || null

  // Если указан счёт — проверяем что он принадлежит нашей организации
  if (cashAccountId) {
    const acc = await db.cashAccount.findUnique({
      where: { id: cashAccountId },
      select: { organizationId: true },
    })
    if (!acc || acc.organizationId !== orgId) {
      throw new Error("Указан недействительный счёт")
    }
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { companyName: true },
  })

  // Если admin не выбрал charges явно — авто-распределение FIFO: гасим самые
  // старые неоплаченные начисления, пока хватает суммы. Только полностью
  // покрытые начисления — partial coverage не делаем (упрощение).
  // Остаток платежа НЕ теряется: хранится в Payment.unappliedAmount как аванс
  // и зачитывается в следующие начисления (аудит 2026-06-10, п.5). В пул
  // гашения включается и ранее накопленный аванс.
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
  const autoDistributed: { ids: string[]; periods: string[] } = { ids: [], periods: [] }
  let finalNote = note ?? null
  let newUnapplied = 0
  let creditConsumed = 0
  let priorCredits: { id: string; unappliedAmount: number }[] = []

  if (chargeIds.length === 0 && amount > 0) {
    priorCredits = await db.payment.findMany({
      where: { tenantId, deletedAt: null, unappliedAmount: { gt: 0 } },
      orderBy: { paymentDate: "asc" },
      select: { id: true, unappliedAmount: true },
    })
    const priorCreditSum = round2(priorCredits.reduce((s, p) => s + p.unappliedAmount, 0))

    const unpaidCharges = await db.charge.findMany({
      where: {
        AND: [
          chargeScope(orgId),
          { tenantId, isPaid: false },
        ],
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, amount: true, period: true },
    })

    let remaining = round2(amount + priorCreditSum)
    for (const c of unpaidCharges) {
      if (remaining + 0.01 < c.amount) break // нельзя частично — целиком или ничего
      autoDistributed.ids.push(c.id)
      autoDistributed.periods.push(c.period)
      remaining = round2(remaining - c.amount)
    }

    // Сколько из покрытия пришлось на новый платёж, а сколько — на прошлый аванс.
    const coveredTotal = round2(amount + priorCreditSum - remaining)
    creditConsumed = Math.max(0, round2(coveredTotal - amount))
    newUnapplied = Math.max(0, round2(amount - coveredTotal))

    if (autoDistributed.ids.length > 0) {
      // Дописываем в payment.note информацию о покрытых начислениях.
      // Сортируем периоды для понятного диапазона.
      const sortedPeriods = [...new Set(autoDistributed.periods)].sort()
      const periodSummary = sortedPeriods.length === 1
        ? sortedPeriods[0]
        : `${sortedPeriods[0]}..${sortedPeriods[sortedPeriods.length - 1]}`
      const autoNote = `Автоматически закрыто: ${autoDistributed.ids.length} начислений за ${periodSummary}`
      finalNote = finalNote ? `${finalNote} · ${autoNote}` : autoNote
    }
    if (newUnapplied > 0.01) {
      const advanceNote = `Аванс: ${newUnapplied.toLocaleString("ru-RU")} ₸ (зачтётся в следующие начисления)`
      finalNote = finalNote ? `${finalNote} · ${advanceNote}` : advanceNote
    }
  }

  // Валидируем переданные charges ДО транзакции: каждый должен принадлежать орг.
  let chargeIdsToMark: string[] = []
  if (chargeIds.length > 0) {
    // БЕЗОПАСНОСТЬ: re-валидируем что каждый charge действительно
    // принадлежит этой орге через chargeScope. Иначе теоретически
    // можно подсунуть чужой charge с тем же tenantId.
    const validCharges = await db.charge.findMany({
      where: {
        AND: [
          chargeScope(orgId),
          { id: { in: chargeIds }, tenantId },
        ],
      },
      select: { id: true, amount: true },
    })
    const validIds = validCharges.map((c) => c.id)

    if (validIds.length !== chargeIds.length) {
      throw new Error("Некоторые начисления недоступны для текущей организации")
    }
    chargeIdsToMark = validIds
    // Переплата сверх выбранных начислений — тоже аванс.
    const selectedSum = round2(validCharges.reduce((s, c) => s + c.amount, 0))
    newUnapplied = Math.max(0, round2(amount - selectedSum))
  } else if (autoDistributed.ids.length > 0) {
    // FIFO авто-распределение: помечаем выбранные charges оплаченными.
    chargeIdsToMark = autoDistributed.ids
  }

  // Атомарно: создаём платёж + (опционально) кассовую проводку + обновление
  // баланса + отметка charges как paid. Интерактивная транзакция нужна, чтобы
  // привязать cashTransaction.paymentId к созданному платежу — иначе
  // deletePayment не найдёт проводку и не откатит CashAccount.balance
  // (см. AUDIT_2026-05-26.md, проблема #5).
  const payment = await db.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        tenantId,
        amount,
        method,
        note: finalNote,
        paymentDate: paymentDate ?? new Date(),
        unappliedAmount: newUnapplied,
      },
    })

    // Списываем использованный в гашении прошлый аванс (старейшие платежи первыми).
    if (creditConsumed > 0.01) {
      let toConsume = creditConsumed
      for (const p of priorCredits) {
        if (toConsume <= 0.01) break
        const take = Math.min(p.unappliedAmount, toConsume)
        await tx.payment.update({
          where: { id: p.id },
          data: { unappliedAmount: round2(p.unappliedAmount - take) },
        })
        toConsume = round2(toConsume - take)
      }
    }

    if (cashAccountId) {
      await recordPaymentCash(tx, {
        paymentId: created.id,
        cashAccountId,
        amount,
        description: `Платёж от ${tenant?.companyName ?? "арендатора"}${note ? ` · ${note}` : ""}`,
      })
    }

    if (chargeIdsToMark.length > 0) {
      await tx.charge.updateMany({
        where: { id: { in: chargeIdsToMark } },
        data: { isPaid: true },
      })
    }

    return created
  })

  revalidatePath("/admin/finances")
  revalidatePath("/admin/finances/balance")
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true, paymentId: payment.id, autoDistributed: autoDistributed.ids.length }
}

/** Ручной запуск авто-генерации счетов за период (то же, что делает cron). */
export async function generateMonthlyInvoicesNow(period: string) {
  await requireCapabilityAndFeature("finance.createInvoice")
  const { orgId } = await requireOrgAccess()
  const p = /^\d{4}-\d{2}$/.test(period) ? period : new Date().toISOString().slice(0, 7)
  const r = await generateMonthlyInvoicesForOrg(orgId, p)
  revalidatePath("/admin/documents")
  revalidatePath("/admin/finances")
  return r
}

export async function generateMonthlyCharges(period: string) {
  await requireCapabilityAndFeature("finance.createInvoice")
  const { orgId } = await requireOrgAccess()
  const buildingId = await getCurrentBuildingId()
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds

  // Только арендаторы текущей организации
  const tenants = await db.tenant.findMany({
    where: {
      AND: [
        tenantScope(orgId),
        {
          OR: [
            { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
            { tenantSpaces: { some: { space: { floor: { buildingId: { in: visibleBuildingIds } } } } } },
            { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
          ],
        },
      ],
    },
    include: {
      space: { include: { floor: true } },
      tenantSpaces: { include: { space: { include: { floor: true } } } },
      fullFloors: true,
      charges: { where: { period, type: "RENT" } },
      // Активный договор для привязки charge.contractId. Если нет SIGNED — null.
      contracts: {
        where: { status: "SIGNED", deletedAt: null },
        orderBy: [{ version: "desc" }, { signedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true },
      },
    },
  })

  let created = 0
  for (const tenant of tenants) {
    if (tenant.charges.length > 0) continue // already has rent for this period

    const rentSchedule = calculateTenantRentChargeForPeriod(tenant, period)
    if (!rentSchedule.shouldCreate) continue
    const placement = formatTenantPlacement(tenant, { includeFloorName: false })
    const activeContractId = tenant.contracts[0]?.id ?? null

    // try/catch P2002: миграция 020 — partial unique index на (tenant_id, period, type).
    // Если cron monthly-invoices опередил — просто пропускаем дубликат.
    try {
      await db.charge.create({
        data: {
          tenantId: tenant.id,
          contractId: activeContractId,
          period,
          type: "RENT",
          amount: rentSchedule.amount,
          description: getTenantRentChargeDescription(placement, period, rentSchedule),
          dueDate: rentSchedule.dueDate,
        },
      })
      created++
    } catch (e) {
      if (!isUniqueConstraintError(e)) throw e
    }

    if (tenant.needsCleaning && tenant.cleaningFee > 0) {
      try {
        await db.charge.create({
          data: {
            tenantId: tenant.id,
            contractId: activeContractId,
            period,
            type: "CLEANING",
            amount: tenant.cleaningFee,
            dueDate: rentSchedule.dueDate,
            description: "Уборка помещения",
          },
        })
      } catch (e) {
        if (!isUniqueConstraintError(e)) throw e
      }
    }
  }

  revalidatePath("/admin/finances")
  return { success: true, created }
}

/**
 * УДАЛЕНО (см. AUDIT_2026-05-26.md, проблема #3, и AUDIT_2026-05-29).
 *
 * Ручное добавление пени создавало PENALTY charge без учёта PENALTY_GRACE_DAYS
 * и без дедупликации — это рассинхронизировало сумму с автоматическим cron-ом
 * check-deadlines (двойные/несогласованные пени). Функция нигде не вызывалась,
 * но оставалась экспортируемым server action.
 *
 * Источник истины для пеней — только cron app/api/cron/check-deadlines.
 * Stub оставлен (как calculatePenalties), чтобы любой случайный вызов был явно
 * виден. Для прочих ручных начислений используйте addCharge.
 */
export async function addPenalty(): Promise<never> {
  throw new Error(
    "Ручное добавление пени удалено. Пени начисляет cron /api/cron/check-deadlines " +
    "с учётом PENALTY_GRACE_DAYS. Для прочих начислений используйте addCharge.",
  )
}

// Из описания пени («Пеня по начислению <id> (...)») достаём id начисления-источника,
// чтобы пометить его penaltyWaived и остановить повторное начисление cron-ом.
const PENALTY_SOURCE_RE = /начислени[юя]\s+([a-z0-9]+)/i

/**
 * Отменить (списать) начисленную пеню. Пока нет онлайн-оплаты и загрузки
 * подтверждения платежа, админ должен иметь возможность убрать пеню вручную.
 * Делает две вещи: (1) мягко удаляет саму пеню (восстановимо), (2) помечает
 * начисление-источник penaltyWaived, чтобы cron check-deadlines не начислил её
 * заново на следующий день. Обратимо через unwaivePenalty.
 */
export async function waivePenalty(
  chargeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("finance.deleteRecords")
    const { orgId } = await requireOrgAccess()
    await assertChargeInOrg(chargeId, orgId)
    const penalty = await db.charge.findFirst({
      where: { id: chargeId, ...chargeScope(orgId), type: "PENALTY" },
      select: { id: true, tenantId: true, description: true },
    })
    if (!penalty) return { ok: false, error: "Пеня не найдена или нет доступа" }

    const srcId = penalty.description?.match(PENALTY_SOURCE_RE)?.[1]
    await db.$transaction(async (tx) => {
      await tx.charge.update({ where: { id: penalty.id }, data: { deletedAt: new Date() } })
      if (srcId) {
        // updateMany со scope по tenantId — флаг ставим только своему начислению.
        await tx.charge.updateMany({
          where: { id: srcId, tenantId: penalty.tenantId ?? undefined },
          data: { penaltyWaived: true },
        })
      }
    })
    revalidatePath("/admin/finances")
    if (penalty.tenantId) revalidatePath(`/admin/tenants/${penalty.tenantId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось отменить пеню" }
  }
}

/** Вернуть ранее отменённую пеню (undo для waivePenalty). */
export async function unwaivePenalty(
  chargeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("finance.deleteRecords")
    const { orgId } = await requireOrgAccess()
    // deletedAt: { not: null } — ищем именно отменённую (soft-deleted) пеню.
    const penalty = await db.charge.findFirst({
      where: { id: chargeId, deletedAt: { not: null }, type: "PENALTY", tenant: { user: { organizationId: orgId } } },
      select: { id: true, tenantId: true, description: true },
    })
    if (!penalty) return { ok: false, error: "Пеня не найдена" }

    const srcId = penalty.description?.match(PENALTY_SOURCE_RE)?.[1]
    await db.$transaction(async (tx) => {
      await tx.charge.update({ where: { id: penalty.id }, data: { deletedAt: null } })
      if (srcId) {
        await tx.charge.updateMany({
          where: { id: srcId, tenantId: penalty.tenantId ?? undefined },
          data: { penaltyWaived: false },
        })
      }
    })
    revalidatePath("/admin/finances")
    if (penalty.tenantId) revalidatePath(`/admin/tenants/${penalty.tenantId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось вернуть пеню" }
  }
}

export async function addCharge(formData: FormData) {
  await requireCapabilityAndFeature("finance.createInvoice")
  const { orgId } = await requireOrgAccess()
  const tenantId = formData.get("tenantId") as string
  await assertTenantInOrg(tenantId, orgId)
  await assertTenantBuildingAccess(tenantId, orgId)

  const type = formData.get("type") as string
  const amountStr = formData.get("amount") as string
  const description = formData.get("description") as string
  const period = formData.get("period") as string
  const dueDateStr = formData.get("dueDate") as string

  const amount = parseFloat(amountStr)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Сумма начисления должна быть положительным числом")
  }

  await db.charge.create({
    data: {
      tenantId,
      period,
      type,
      amount,
      description: description || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
    },
  })

  // Накопленный аванс арендатора автоматически гасит новое начисление.
  await applyTenantCreditToCharges(tenantId)

  // Арендатор должен узнать о новом начислении сразу (аудит 2026-06-10, п.8).
  const tenantUser = await db.tenant.findUnique({ where: { id: tenantId }, select: { userId: true } })
  if (tenantUser?.userId) {
    await notifyUser({
      userId: tenantUser.userId,
      type: "PAYMENT_DUE",
      title: `Новое начисление за ${period}`,
      message: `${CHARGE_TYPES[type] ?? type}: ${amount.toLocaleString("ru-RU")} ₸${dueDateStr ? `, оплатить до ${new Date(dueDateStr).toLocaleDateString("ru-RU")}` : ""}.`,
      link: "/cabinet/finances",
    }).catch(() => {})
  }

  revalidatePath("/admin/finances")
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true }
}

export async function saveTenantServiceCharges(tenantId: string, formData: FormData) {
  await requireCapabilityAndFeature("finance.createInvoice")
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)
  await assertTenantBuildingAccess(tenantId, orgId)

  const period = parsePeriod(formData.get("period"))
  if (!period) throw new Error("Укажите период в формате YYYY-MM")

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { paymentDueDay: true },
  })
  if (!tenant) throw new Error("Арендатор не найден")

  const [year, month] = period.split("-").map(Number)
  const lastDayOfMonth = new Date(year, month, 0).getDate()
  const dueDay = Math.min(tenant.paymentDueDay, lastDayOfMonth)
  const dueDate = parseDateOrNull(formData.get("dueDate")) ?? new Date(year, month - 1, dueDay)
  const selectedTypes = formData
    .getAll("services")
    .map((value) => String(value))
    .filter(isServiceChargeType)

  if (selectedTypes.length === 0) {
    throw new Error("Выберите хотя бы одну услугу")
  }

  const uniqueTypes = [...new Set(selectedTypes)]
  const operations: Array<{
    type: (typeof SERVICE_CHARGE_TYPE_VALUES)[number]
    amount: number
    description: string
  }> = []

  for (const type of uniqueTypes) {
    const amount = parseChargeAmount(formData.get(`amount_${type}`))
    if (amount === null) {
      throw new Error(`Укажите сумму для услуги «${getServiceChargeDescription(type)}»`)
    }
    const customDescription = String(formData.get(`description_${type}`) ?? "").trim()
    operations.push({
      type,
      amount,
      description: customDescription || `${getServiceChargeDescription(type)} за ${period}`,
    })
  }

  let created = 0
  let updated = 0

  await db.$transaction(async (tx) => {
    for (const item of operations) {
      const existing = await tx.charge.findFirst({
        where: { tenantId, period, type: item.type },
        select: { id: true, isPaid: true },
      })

      if (existing?.isPaid) {
        throw new Error(`Начисление «${getServiceChargeDescription(item.type)}» за ${period} уже оплачено`)
      }

      if (existing) {
        await tx.charge.update({
          where: { id: existing.id },
          data: {
            amount: item.amount,
            description: item.description,
            dueDate,
          },
        })
        updated++
      } else {
        await tx.charge.create({
          data: {
            tenantId,
            period,
            type: item.type,
            amount: item.amount,
            description: item.description,
            dueDate,
          },
        })
        created++
      }
    }
  })

  revalidatePath("/admin/finances")
  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/documents/new/invoice")
  revalidatePath("/admin/documents/new/act")

  return { success: true, created, updated }
}

export async function deleteCharge(chargeId: string) {
  await requireCapabilityAndFeature("finance.deleteRecords")
  const { orgId } = await requireOrgAccess()
  await assertChargeInOrg(chargeId, orgId)

  // findFirst со scope защищает от гонки между assert и delete
  const charge = await db.charge.findFirst({
    where: { id: chargeId, ...chargeScope(orgId) },
    select: { tenantId: true },
  })
  if (!charge) throw new Error("Начисление не найдено или нет доступа")
  // Soft delete (миграция 019). Восстановление возможно через recycle bin.
  await db.charge.update({ where: { id: chargeId }, data: { deletedAt: new Date() } })
  revalidatePath("/admin/finances")
  if (charge.tenantId) revalidatePath(`/admin/tenants/${charge.tenantId}`)
}

export async function deletePayment(paymentId: string) {
  await requireCapabilityAndFeature("finance.deleteRecords")
  const { orgId } = await requireOrgAccess()
  await assertPaymentInOrg(paymentId, orgId)

  const payment = await db.payment.findFirst({
    where: { id: paymentId, ...paymentScope(orgId) },
    select: { tenantId: true, amount: true },
  })
  if (!payment) throw new Error("Платёж не найден или нет доступа")

  // Soft-delete платежа + компенсация баланса кассы. Иначе CashAccount.balance
  // расходится с реальностью (см. AUDIT_2026-05-26.md, проблема #5).
  //
  // CashTransaction НЕ удаляем физически — оставляем привязанной к soft-deleted
  // платежу, чтобы restorePayment мог вернуть баланс. Проводки нигде в UI не
  // листаются, поэтому «висящая» запись безвредна. amount знаковый: + приход,
  // − расход; на удаление вычитаем из баланса, на restorePayment — прибавляем.
  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: { deletedAt: new Date() },
    })
    await reversePaymentCash(tx, paymentId)
  })

  revalidatePath("/admin/finances")
  revalidatePath("/admin/finances/balance")
  if (payment.tenantId) revalidatePath(`/admin/tenants/${payment.tenantId}`)
}

/**
 * Подтверждение квитанции о приёме наличных администратором. Квитанция
 * считается действительной (и печатается) только после подтверждения —
 * фиксируем кто и когда подтвердил. Только для оплат наличными.
 */
export async function confirmCashReceipt(
  paymentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapabilityAndFeature("finance.confirmPayment")
  await requireCapabilityAndFeature("finance.cashPayment")
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const payment = await db.payment.findFirst({
    where: { id: paymentId, ...paymentScope(orgId) },
    select: { id: true, method: true, receiptConfirmedAt: true },
  })
  if (!payment) return { ok: false, error: "Платёж не найден или нет доступа" }
  if (payment.method !== "CASH") {
    return { ok: false, error: "Квитанция о приёме наличных доступна только для оплат наличными" }
  }
  if (payment.receiptConfirmedAt) return { ok: false, error: "Квитанция уже подтверждена" }

  await db.payment.update({
    where: { id: paymentId },
    data: { receiptConfirmedAt: new Date(), receiptConfirmedById: session.user.id },
  })

  revalidatePath(`/admin/finances/receipt/${paymentId}`)
  revalidatePath("/admin/finances")
  return { ok: true }
}

export async function deleteExpense(expenseId: string) {
  await requireCapabilityAndFeature("finance.deleteRecords")
  const { orgId } = await requireOrgAccess()
  await assertExpenseInOrg(expenseId, orgId)

  await db.expense.delete({ where: { id: expenseId } })
  revalidatePath("/admin/finances")
}

/**
 * Восстановить soft-deleted начисление. Используется в toast «Отменить» сразу после
 * `deleteCharge`. Только для записей внутри текущей орг (chargeScope не учитывает
 * deletedAt — поэтому проверяем явно через withDeleted-вариант).
 */
export async function restoreCharge(chargeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("finance.deleteRecords")
    const { orgId } = await requireOrgAccess()
    // findFirst с deletedAt: { not: null } — ищем именно удалённую запись И
    // отключаем авто-фильтр soft-delete extension (без упоминания deletedAt он
    // подставил бы deletedAt: null, и удалённое начисление не нашлось бы).
    const charge = await db.charge.findFirst({
      where: { id: chargeId, deletedAt: { not: null }, tenant: { user: { organizationId: orgId } } },
      select: { id: true, tenantId: true },
    })
    if (!charge) return { ok: false, error: "Начисление не найдено" }
    await db.charge.update({ where: { id: chargeId }, data: { deletedAt: null } })
    revalidatePath("/admin/finances")
    if (charge.tenantId) revalidatePath(`/admin/tenants/${charge.tenantId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось восстановить" }
  }
}

/**
 * Восстановить soft-deleted платёж.
 */
export async function restorePayment(paymentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("finance.deleteRecords")
    const { orgId } = await requireOrgAccess()
    // deletedAt: { not: null } — ищем именно удалённый платёж И отключаем
    // авто-фильтр soft-delete extension (иначе findFirst подставит deletedAt:null
    // и не найдёт удалённую запись).
    const payment = await db.payment.findFirst({
      where: { id: paymentId, deletedAt: { not: null }, tenant: { user: { organizationId: orgId } } },
      select: { id: true, tenantId: true },
    })
    if (!payment) return { ok: false, error: "Платёж не найден" }
    // Восстанавливаем платёж и возвращаем баланс кассы (deletePayment его
    // декрементировал, проводку оставил привязанной).
    await db.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { deletedAt: null } })
      await reapplyPaymentCash(tx, paymentId)
    })
    revalidatePath("/admin/finances")
    revalidatePath("/admin/finances/balance")
    if (payment.tenantId) revalidatePath(`/admin/tenants/${payment.tenantId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось восстановить" }
  }
}

/**
 * Массово отметить начисления оплаченными. Применяется bulk-bar над таблицей
 * начислений. Все записи должны принадлежать текущей орг (chargeScope).
 */
export async function bulkMarkChargesPaid(
  ids: string[],
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("finance.recordPayment")
    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: "Не выбрано ни одного начисления" }
    const { orgId } = await requireOrgAccess()
    // updateMany с scope защищает от чужих ID.
    const result = await db.charge.updateMany({
      where: {
        AND: [chargeScope(orgId), { id: { in: ids } }, { isPaid: false }],
      },
      data: { isPaid: true },
    })
    revalidatePath("/admin/finances")
    return { ok: true, updated: result.count }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось отметить" }
  }
}

/**
 * Массовое soft-delete платежей. Возвращает массив удалённых ID, чтобы клиент
 * мог предложить undo через `restorePayment` для каждого.
 */
export async function bulkDeletePayments(
  ids: string[],
): Promise<{ ok: true; deleted: string[] } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("finance.deleteRecords")
    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: "Не выбрано ни одного платежа" }
    const { orgId } = await requireOrgAccess()
    // updateMany со scope защитит от чужих ID — paymentScope фильтрует
    // tenant.user.organizationId.
    const eligible = await db.payment.findMany({
      where: { AND: [paymentScope(orgId), { id: { in: ids } }] },
      select: { id: true },
    })
    const eligibleIds = eligible.map((p) => p.id)
    if (eligibleIds.length === 0) return { ok: false, error: "Нет доступных для удаления платежей" }
    // Удаляем платежи ВМЕСТЕ со связанными кассовыми проводками и компенсируем
    // баланс каждого счёта — как одиночный deletePayment. Иначе bulk-delete
    // оставляет CashAccount.balance завышенным (см. AUDIT_2026-05-26.md, #5).
    await db.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { id: { in: eligibleIds } },
        data: { deletedAt: new Date() },
      })
      await reversePaymentCash(tx, eligibleIds)
    })
    revalidatePath("/admin/finances")
    revalidatePath("/admin/finances/balance")
    return { ok: true, deleted: eligibleIds }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось удалить" }
  }
}

/**
 * Массовое soft-delete начислений. Возвращает массив удалённых ID, чтобы клиент
 * мог предложить undo через `restoreCharge` для каждого.
 */
export async function bulkDeleteCharges(
  ids: string[],
): Promise<{ ok: true; deleted: string[] } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("finance.deleteRecords")
    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: "Не выбрано ни одного начисления" }
    const { orgId } = await requireOrgAccess()
    const eligible = await db.charge.findMany({
      where: { AND: [chargeScope(orgId), { id: { in: ids } }] },
      select: { id: true },
    })
    const eligibleIds = eligible.map((c) => c.id)
    if (eligibleIds.length === 0) return { ok: false, error: "Нет доступных для удаления начислений" }
    await db.charge.updateMany({
      where: { id: { in: eligibleIds } },
      data: { deletedAt: new Date() },
    })
    revalidatePath("/admin/finances")
    return { ok: true, deleted: eligibleIds }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось удалить" }
  }
}

export async function addExpense(formData: FormData) {
  await requireCapabilityAndFeature("finance.manageExpenses")
  const { orgId } = await requireOrgAccess()
  const selectedBuildingId = String(formData.get("buildingId") ?? "").trim()
  const buildingId = (await getCurrentBuildingId()) ?? selectedBuildingId
  if (!buildingId) return { error: "Здание не выбрано" }
  await assertBuildingAccess(buildingId, orgId)

  const category = formData.get("category") as string
  const amountStr = formData.get("amount") as string
  const description = formData.get("description") as string
  const period = formData.get("period") as string
  const dateStr = formData.get("date") as string
  // Опционально: с какого счёта списать (банк/касса/карта).
  const cashAccountId = (formData.get("cashAccountId") as string)?.trim() || null

  const amount = parseFloat(amountStr)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Сумма расхода должна быть положительным числом" }
  }

  if (cashAccountId) {
    const acc = await db.cashAccount.findUnique({
      where: { id: cashAccountId },
      select: { organizationId: true },
    })
    if (!acc || acc.organizationId !== orgId) {
      return { error: "Указан недействительный счёт" }
    }
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [
    db.expense.create({
      data: {
        buildingId,
        category,
        amount,
        description: description || null,
        period,
        date: dateStr ? new Date(dateStr) : new Date(),
      },
    }),
  ]

  if (cashAccountId) {
    operations.push(
      db.cashTransaction.create({
        data: {
          accountId: cashAccountId,
          amount: -amount,
          type: "WITHDRAW",
          description: `Расход${description ? ` · ${description}` : ` · ${category}`}`,
        },
      }),
      db.cashAccount.update({
        where: { id: cashAccountId },
        data: { balance: { decrement: amount } },
      }),
    )
  }

  await db.$transaction(operations)

  revalidatePath("/admin/finances")
  revalidatePath("/admin/finances/balance")
  return { success: true }
}
