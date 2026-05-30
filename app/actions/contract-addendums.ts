"use server"

import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { contractScope } from "@/lib/tenant-scope"
import { sendContractForSignature } from "@/app/actions/contract-workflow"

function fmt(d: Date | string): string {
  return new Date(d).toLocaleDateString("ru-RU")
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
