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
      },
    })

    if (!contract) return { applied: false, reason: "not_found" }
    if (contract.type !== "ADDENDUM") return { applied: false, reason: "not_addendum" }
    if (contract.status !== "SIGNED") return { applied: false, reason: "not_signed" }
    if (contract.appliedAt) return { applied: false, reason: "already_applied" }
    if (contract.changeKind !== "RENTAL_TERMS") return { applied: false, reason: "unsupported_change" }

    const payload = asRecord(contract.changePayload)
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
