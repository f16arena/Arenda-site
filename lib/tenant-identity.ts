import { assertKazakhstanIin } from "@/lib/kz-iin"

export type TenantLegalType = "IP" | "TOO" | "AO" | "CHSI" | "PHYSICAL"

const LEGAL_TYPES = new Set<TenantLegalType>(["IP", "TOO", "AO", "CHSI", "PHYSICAL"])

export function normalizeTenantLegalType(value: unknown): TenantLegalType {
  const raw = String(value ?? "IP").trim().toUpperCase()
  if (raw === "CHSI" || raw === "ЧСИ" || raw.includes("СУДЕБН") || raw.includes("ИСПОЛНИТЕЛ")) return "CHSI"
  if (raw === "PERSON" || raw === "INDIVIDUAL" || raw === "FL" || raw === "ФЛ") return "PHYSICAL"
  return LEGAL_TYPES.has(raw as TenantLegalType) ? (raw as TenantLegalType) : "IP"
}

export function tenantLegalTypeUsesBin(value: unknown) {
  const legalType = normalizeTenantLegalType(value)
  return legalType === "TOO" || legalType === "AO"
}

export function tenantLegalTypeUsesIin(value: unknown) {
  return !tenantLegalTypeUsesBin(value)
}

export function tenantTaxIdLabel(value: unknown) {
  return tenantLegalTypeUsesBin(value) ? "БИН" : "ИИН"
}

export function tenantTaxIdValue(args: {
  legalType: unknown
  bin?: string | null
  iin?: string | null
}) {
  return tenantLegalTypeUsesBin(args.legalType) ? args.bin ?? "" : args.iin ?? args.bin ?? ""
}

function normalizeTaxId(value: FormDataEntryValue | string | null | undefined, label: "БИН" | "ИИН") {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const compact = raw.replace(/\s+/g, "")
  if (!/^\d+$/.test(compact)) {
    throw new Error(`${label} должен содержать только цифры`)
  }
  if (compact.length !== 12) {
    throw new Error(`${label} должен состоять из 12 цифр`)
  }
  return compact
}

function normalizeIin(value: FormDataEntryValue | string | null | undefined) {
  return assertKazakhstanIin(value)
}

export function normalizeTenantTaxIds(args: {
  legalType: unknown
  bin?: FormDataEntryValue | string | null
  iin?: FormDataEntryValue | string | null
}) {
  const legalType = normalizeTenantLegalType(args.legalType)
  const usesBin = tenantLegalTypeUsesBin(legalType)

  if (usesBin) {
    return {
      legalType,
      bin: normalizeTaxId(args.bin, "БИН"),
      iin: null,
    }
  }

  return {
    legalType,
    bin: null,
    iin: normalizeIin(args.iin ?? args.bin),
  }
}
