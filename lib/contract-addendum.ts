import "server-only"

import { db } from "@/lib/db"
import { normalizeTenantRentChoice } from "@/lib/rent"

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as JsonRecord
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed * 100) / 100
}

function numberInRange(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null
  return Math.round(parsed * 1000) / 1000
}

function boolOrNull(value: unknown) {
  if (typeof value === "boolean") return value
  if (value === "true") return true
  if (value === "false") return false
  return null
}

export async function applySignedContractChanges(contractId: string) {
  return db.$transaction(async (tx) => {
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        tenantId: true,
        type: true,
        status: true,
        changeKind: true,
        changePayload: true,
        appliedAt: true,
        parentContractId: true,
      },
    })

    if (!contract) return { applied: false, reason: "not_found" }
    if (contract.type !== "ADDENDUM") return { applied: false, reason: "not_addendum" }
    if (contract.status !== "SIGNED") return { applied: false, reason: "not_signed" }
    if (contract.appliedAt) return { applied: false, reason: "already_applied" }

    const payload = asRecord(contract.changePayload)

    // Продление срока: меняем дату окончания родительского договора и арендатора.
    if (contract.changeKind === "EXTEND_TERM") {
      const raw = payload?.newEndDate
      const newEndDate = raw ? new Date(String(raw)) : null
      if (!newEndDate || Number.isNaN(newEndDate.getTime())) return { applied: false, reason: "missing_end_date" }
      if (contract.parentContractId) {
        await tx.contract.update({ where: { id: contract.parentContractId }, data: { endDate: newEndDate } })
      }
      await tx.tenant.update({ where: { id: contract.tenantId }, data: { contractEnd: newEndDate } })
      await tx.contract.update({ where: { id: contract.id }, data: { appliedAt: new Date() } })
      return { applied: true, reason: "term_extended" }
    }

    // Расторжение: завершаем срок аренды и архивируем родительский договор.
    if (contract.changeKind === "TERMINATE") {
      const raw = payload?.terminationDate
      const termDate = raw ? new Date(String(raw)) : new Date()
      const effective = Number.isNaN(termDate.getTime()) ? new Date() : termDate
      if (contract.parentContractId) {
        await tx.contract.update({ where: { id: contract.parentContractId }, data: { status: "ARCHIVED", endDate: effective } })
      }
      await tx.tenant.update({ where: { id: contract.tenantId }, data: { contractEnd: effective } })
      await tx.contract.update({ where: { id: contract.id }, data: { appliedAt: new Date() } })
      return { applied: true, reason: "terminated" }
    }

    // Доп. услуги / эксплуатационные расходы: уборку применяем к арендатору
    // (needsCleaning/cleaningFee — поля арендатора), остальное фиксируется как
    // согласованный текст ДС (неотъемлемая часть договора).
    if (contract.changeKind === "SERVICES") {
      const services = asRecord(payload?.services)
      const cleaning = asRecord(services?.cleaning)
      const data: { needsCleaning?: boolean; cleaningFee?: number } = {}
      if (cleaning) {
        data.needsCleaning = true
        const fee = numberInRange(cleaning.fee, 0, 1_000_000_000)
        if (fee !== null) data.cleaningFee = fee
      }
      if (Object.keys(data).length) {
        await tx.tenant.update({ where: { id: contract.tenantId }, data })
      }
      await tx.contract.update({ where: { id: contract.id }, data: { appliedAt: new Date() } })
      return { applied: true, reason: "services_applied" }
    }

    // Прочие изменения (свободный текст) — фиксируем факт подписания, без структурных правок.
    if (contract.changeKind === "OTHER") {
      await tx.contract.update({ where: { id: contract.id }, data: { appliedAt: new Date() } })
      return { applied: true, reason: "other_applied" }
    }

    if (contract.changeKind !== "RENTAL_TERMS") return { applied: false, reason: "unsupported_change" }

    const newTerms = asRecord(payload?.newTerms) ?? asRecord(payload?.after)
    if (!newTerms) return { applied: false, reason: "missing_terms" }

    const rentChoice = normalizeTenantRentChoice({
      customRate: numberOrNull(newTerms.customRate),
      fixedMonthlyRent: numberOrNull(newTerms.fixedMonthlyRent),
    })

    const data: {
      customRate: number | null
      fixedMonthlyRent: number | null
      cleaningFee?: number
      needsCleaning?: boolean
      paymentDueDay?: number
      penaltyPercent?: number
      depositAmount?: number | null
      rentFreeMonths?: number
      moveInDate?: Date | null
    } = {
      customRate: rentChoice.customRate,
      fixedMonthlyRent: rentChoice.fixedMonthlyRent,
    }

    const cleaningFee = numberInRange(newTerms.cleaningFee, 0, 1_000_000_000)
    if (cleaningFee !== null) data.cleaningFee = cleaningFee

    const needsCleaning = boolOrNull(newTerms.needsCleaning)
    if (needsCleaning !== null) data.needsCleaning = needsCleaning

    const paymentDueDay = numberInRange(newTerms.paymentDueDay, 1, 31)
    if (paymentDueDay !== null) data.paymentDueDay = Math.round(paymentDueDay)

    const penaltyPercent = numberInRange(newTerms.penaltyPercent, 0, 100)
    if (penaltyPercent !== null) data.penaltyPercent = penaltyPercent

    // Депозит: явный null сбрасывает (= 1 месяц аренды), число ≥ 0 — фиксирует.
    if (Object.prototype.hasOwnProperty.call(newTerms, "depositAmount")) {
      const raw = newTerms.depositAmount
      if (raw === null || raw === "") data.depositAmount = null
      else {
        const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."))
        if (Number.isFinite(n) && n >= 0) data.depositAmount = Math.round(n * 100) / 100
      }
    }

    const rentFreeMonths = numberInRange(newTerms.rentFreeMonths, 0, 24)
    if (rentFreeMonths !== null) data.rentFreeMonths = Math.round(rentFreeMonths)

    // Дата заселения: явный null сбрасывает (= дата начала договора).
    if (Object.prototype.hasOwnProperty.call(newTerms, "moveInDate")) {
      const raw = newTerms.moveInDate
      if (raw === null || raw === "") data.moveInDate = null
      else {
        const d = new Date(String(raw))
        if (!Number.isNaN(d.getTime())) data.moveInDate = d
      }
    }

    await tx.tenant.update({
      where: { id: contract.tenantId },
      data,
    })

    await tx.contract.update({
      where: { id: contract.id },
      data: { appliedAt: new Date() },
    })

    return { applied: true, reason: "rental_terms_applied" }
  })
}
