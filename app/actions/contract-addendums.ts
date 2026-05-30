"use server"

import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { contractScope } from "@/lib/tenant-scope"
import { sendContractForSignature } from "@/app/actions/contract-workflow"

function fmt(d: Date | string): string {
  return new Date(d).toLocaleDateString("ru-RU")
}

export interface ParentContractOption {
  id: string
  number: string
  tenantId: string
  tenantName: string
  startDate: string | null
  endDate: string | null
  status: string
}

/**
 * Список договоров, к которым можно оформить доп. соглашение: основные (не ADDENDUM),
 * не удалённые. Для выпадашки «к какому договору» при создании ДС.
 */
export async function listParentContractsForAddendum(): Promise<ParentContractOption[]> {
  const { orgId } = await requireOrgAccess()
  const rows = await db.contract.findMany({
    where: { ...contractScope(orgId), type: { not: "ADDENDUM" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, number: true, status: true, startDate: true, endDate: true, tenantId: true,
      tenant: { select: { companyName: true } },
    },
    take: 500,
  })
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    tenantId: r.tenantId,
    tenantName: r.tenant.companyName,
    startDate: r.startDate ? r.startDate.toISOString() : null,
    endDate: r.endDate ? r.endDate.toISOString() : null,
    status: r.status,
  }))
}

async function loadParent(contractId: string, orgId: string) {
  const c = await db.contract.findFirst({
    where: { id: contractId, ...contractScope(orgId) },
    select: {
      id: true, number: true, startDate: true, status: true, type: true, tenantId: true,
      tenant: { select: { companyName: true } },
    },
  })
  if (!c) return { error: "Договор не найден или нет доступа" as const }
  if (c.type === "ADDENDUM") return { error: "Нельзя оформить ДС к доп. соглашению — выберите основной договор" as const }
  return { contract: c }
}

/** Следующий номер ДС для договора: {номер договора}-ДС{N}. */
async function nextAddendumNumber(parentId: string, parentNumber: string): Promise<string> {
  const n = await db.contract.count({ where: { parentContractId: parentId, type: "ADDENDUM" } })
  return `${parentNumber}-ДС${n + 1}`
}

/** Продление срока договора через ДС: создаёт ADDENDUM (EXTEND_TERM) и отправляет арендатору. */
export async function createExtensionAddendum(
  contractId: string,
  newEndDate: string,
): Promise<{ ok: boolean; error?: string; contractId?: string; signUrl?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    const end = new Date(newEndDate)
    if (Number.isNaN(end.getTime())) return { ok: false, error: "Укажите корректную дату окончания" }

    const r = await loadParent(contractId, orgId)
    if ("error" in r) return { ok: false, error: r.error }
    const parent = r.contract

    const number = await nextAddendumNumber(parent.id, parent.number)
    const today = new Date()
    const content = [
      `ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ № ${number}`,
      `к Договору аренды № ${parent.number}${parent.startDate ? ` от ${fmt(parent.startDate)}` : ""}`,
      "",
      `г. ${today.toLocaleDateString("ru-RU")}`,
      "",
      `Арендодатель и Арендатор (${parent.tenant.companyName}) договорились о нижеследующем:`,
      `1. Продлить срок действия Договора аренды № ${parent.number} до ${fmt(end)} (включительно).`,
      `2. Настоящее Дополнительное соглашение вступает в силу с ${fmt(today)} и является неотъемлемой частью Договора.`,
      `3. В остальном условия Договора остаются неизменными.`,
      `4. Составлено в двух экземплярах, имеющих равную юридическую силу.`,
    ].join("\n")

    const addendum = await db.contract.create({
      data: {
        tenantId: parent.tenantId,
        number,
        type: "ADDENDUM",
        content,
        parentContractId: parent.id,
        changeKind: "EXTEND_TERM",
        changePayload: { newEndDate: end.toISOString() },
        effectiveDate: today,
        startDate: today,
        endDate: end,
        status: "DRAFT",
      },
      select: { id: true },
    })

    const sent = await sendContractForSignature(addendum.id)
    return { ok: true, contractId: addendum.id, signUrl: sent.ok ? sent.signUrl : undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось создать ДС о продлении" }
  }
}

/** Расторжение договора через ДС: создаёт ADDENDUM (TERMINATE) и отправляет арендатору. */
export async function createTerminationAddendum(
  contractId: string,
  terminationDate: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string; contractId?: string; signUrl?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    const term = new Date(terminationDate)
    if (Number.isNaN(term.getTime())) return { ok: false, error: "Укажите корректную дату расторжения" }

    const r = await loadParent(contractId, orgId)
    if ("error" in r) return { ok: false, error: r.error }
    const parent = r.contract

    const number = await nextAddendumNumber(parent.id, parent.number)
    const today = new Date()
    const content = [
      `СОГЛАШЕНИЕ о расторжении № ${number}`,
      `Договора аренды № ${parent.number}${parent.startDate ? ` от ${fmt(parent.startDate)}` : ""}`,
      "",
      `г. ${today.toLocaleDateString("ru-RU")}`,
      "",
      `Арендодатель и Арендатор (${parent.tenant.companyName}) договорились о нижеследующем:`,
      `1. Расторгнуть Договор аренды № ${parent.number} с ${fmt(term)}.`,
      ...(reason ? [`2. Основание расторжения: ${reason}.`] : []),
      `${reason ? "3" : "2"}. Стороны производят окончательный взаиморасчёт; Помещение возвращается Арендодателю по акту.`,
      `${reason ? "4" : "3"}. Настоящее Соглашение является неотъемлемой частью Договора и составлено в двух экземплярах.`,
    ].join("\n")

    const addendum = await db.contract.create({
      data: {
        tenantId: parent.tenantId,
        number,
        type: "ADDENDUM",
        content,
        parentContractId: parent.id,
        changeKind: "TERMINATE",
        changePayload: { terminationDate: term.toISOString(), reason: reason ?? null },
        effectiveDate: term,
        startDate: today,
        status: "DRAFT",
      },
      select: { id: true },
    })

    const sent = await sendContractForSignature(addendum.id)
    return { ok: true, contractId: addendum.id, signUrl: sent.ok ? sent.signUrl : undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось создать соглашение о расторжении" }
  }
}

export interface RentalTermsChange {
  customRate?: number | null
  fixedMonthlyRent?: number | null
  cleaningFee?: number | null
  needsCleaning?: boolean | null
  paymentDueDay?: number | null
  penaltyPercent?: number | null
  depositAmount?: number | null
  rentFreeMonths?: number | null
  /** YYYY-MM-DD или null (сброс к дате начала договора) */
  moveInDate?: string | null
}

function money(v: number | null | undefined): string {
  return typeof v === "number" ? new Intl.NumberFormat("ru-RU").format(v) + " ₸" : "—"
}

/**
 * Изменение условий аренды через ДС: создаёт ADDENDUM (RENTAL_TERMS) и отправляет
 * арендатору. После подписания applySignedContractChanges применит новые условия
 * к арендатору (ставка/сумма/уборка/день оплаты/пеня).
 */
export async function createRentalTermsAddendum(
  contractId: string,
  terms: RentalTermsChange,
  effectiveDateStr?: string,
): Promise<{ ok: boolean; error?: string; contractId?: string; signUrl?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()

    // Должна быть указана хотя бы одна стоимость аренды (ставка ИЛИ фикс. сумма).
    const hasRate = typeof terms.customRate === "number" && terms.customRate > 0
    const hasFixed = typeof terms.fixedMonthlyRent === "number" && terms.fixedMonthlyRent > 0
    if (hasRate && hasFixed) return { ok: false, error: "Укажите либо ставку за м², либо фикс. сумму — не одновременно" }
    if (!hasRate && !hasFixed) return { ok: false, error: "Укажите новую стоимость аренды (ставку за м² или фикс. сумму)" }

    const r = await loadParent(contractId, orgId)
    if ("error" in r) return { ok: false, error: r.error }
    const parent = r.contract

    const eff = effectiveDateStr ? new Date(effectiveDateStr) : new Date()
    if (Number.isNaN(eff.getTime())) return { ok: false, error: "Укажите корректную дату вступления в силу" }

    const number = await nextAddendumNumber(parent.id, parent.number)
    const today = new Date()
    const newTerms = {
      customRate: hasRate ? terms.customRate : null,
      fixedMonthlyRent: hasFixed ? terms.fixedMonthlyRent : null,
      ...(typeof terms.cleaningFee === "number" ? { cleaningFee: terms.cleaningFee } : {}),
      ...(typeof terms.needsCleaning === "boolean" ? { needsCleaning: terms.needsCleaning } : {}),
      ...(typeof terms.paymentDueDay === "number" ? { paymentDueDay: terms.paymentDueDay } : {}),
      ...(typeof terms.penaltyPercent === "number" ? { penaltyPercent: terms.penaltyPercent } : {}),
      ...(terms.depositAmount !== undefined ? { depositAmount: terms.depositAmount } : {}),
      ...(typeof terms.rentFreeMonths === "number" ? { rentFreeMonths: terms.rentFreeMonths } : {}),
      ...(terms.moveInDate !== undefined ? { moveInDate: terms.moveInDate } : {}),
    }
    const rentLine = hasFixed
      ? `аренда составляет ${money(terms.fixedMonthlyRent)}/мес (фиксированная сумма)`
      : `ставка аренды составляет ${money(terms.customRate)}/м² в месяц`
    const extra: string[] = []
    if (typeof terms.cleaningFee === "number") extra.push(`Стоимость уборки: ${money(terms.cleaningFee)}/мес.`)
    if (typeof terms.depositAmount === "number") extra.push(`Гарантийный депозит: ${money(terms.depositAmount)}.`)
    if (typeof terms.rentFreeMonths === "number") extra.push(`Арендные каникулы: ${terms.rentFreeMonths} мес.`)
    if (terms.moveInDate) extra.push(`Дата заселения: ${fmt(terms.moveInDate)}.`)
    const lines = [
      `ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ № ${number}`,
      `к Договору аренды № ${parent.number}${parent.startDate ? ` от ${fmt(parent.startDate)}` : ""}`,
      "",
      `г. ${today.toLocaleDateString("ru-RU")}`,
      "",
      `Арендодатель и Арендатор (${parent.tenant.companyName}) договорились о нижеследующем:`,
      `1. С ${fmt(eff)} ${rentLine}.`,
      ...extra.map((t, i) => `${i + 2}. ${t}`),
      `${extra.length + 2}. Остальные условия Договора остаются без изменений.`,
      `${extra.length + 3}. Настоящее соглашение является неотъемлемой частью Договора и составлено в двух экземплярах.`,
    ]
    const content = lines.join("\n")

    const addendum = await db.contract.create({
      data: {
        tenantId: parent.tenantId,
        number,
        type: "ADDENDUM",
        content,
        parentContractId: parent.id,
        changeKind: "RENTAL_TERMS",
        changePayload: { newTerms },
        effectiveDate: eff,
        startDate: today,
        status: "DRAFT",
      },
      select: { id: true },
    })

    const sent = await sendContractForSignature(addendum.id)
    return { ok: true, contractId: addendum.id, signUrl: sent.ok ? sent.signUrl : undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось создать ДС об изменении условий" }
  }
}
