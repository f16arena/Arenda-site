import { assertKazakhstanIin, type KzIinIssue } from "@/lib/kz-iin"

/**
 * Переводчик сообщений проверки БИН/ИИН. Ключи те же, что у lib/kz-iin.ts
 * (common.iinChecks.*), поэтому вызывающая сторона передаёт один и тот же
 * помощник и для БИН, и для ИИН. Без переводчика текст остаётся русским.
 */
export type TaxIdTranslate = (issue: KzIinIssue | null, label: string) => string

type IinCheckKey = `common.iinChecks.${KzIinIssue}` | "common.iinChecks.invalid"

/**
 * Готовый переводчик из t вызывающей стороны. Тип ключа узкий, а не string, —
 * тогда t из getT() подходит без приведения (его ключ шире).
 */
export function taxIdMessage(
  t: (key: IinCheckKey, vars?: Record<string, string | number>) => string,
): TaxIdTranslate {
  return (issue, label) =>
    t(issue ? (`common.iinChecks.${issue}` as IinCheckKey) : "common.iinChecks.invalid", { label })
}

/**
 * Формы собственности для арендатора (РК). Расширено 2026-05-26:
 *   ADVOKAT  — адвокат (Закон РК «Об адвокатской деятельности», подписывает
 *              на основании Лицензии Министерства юстиции)
 *   NOTARIUS — нотариус (Закон РК «О нотариате», Лицензия МЮ)
 *
 * Все «персональные» формы (IP/CHSI/ADVOKAT/NOTARIUS/PHYSICAL) идентифицируются
 * по ИИН, юридические (TOO/AO) — по БИН.
 */
export type TenantLegalType = "IP" | "TOO" | "AO" | "CHSI" | "ADVOKAT" | "NOTARIUS" | "PHYSICAL"

const LEGAL_TYPES = new Set<TenantLegalType>(["IP", "TOO", "AO", "CHSI", "ADVOKAT", "NOTARIUS", "PHYSICAL"])

export function normalizeTenantLegalType(value: unknown): TenantLegalType {
  const raw = String(value ?? "IP").trim().toUpperCase()
  if (raw === "CHSI" || raw === "ЧСИ" || raw.includes("СУДЕБН") || raw.includes("ИСПОЛНИТЕЛ")) return "CHSI"
  if (raw === "ADVOKAT" || raw === "АДВОКАТ" || raw === "ADVOCAT" || raw === "LAWYER") return "ADVOKAT"
  if (raw === "NOTARIUS" || raw === "НОТАРИУС" || raw === "NOTARY") return "NOTARIUS"
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

function normalizeTaxId(
  value: FormDataEntryValue | string | null | undefined,
  label: string,
  translate?: TaxIdTranslate,
) {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const compact = raw.replace(/\s+/g, "")
  if (!/^\d+$/.test(compact)) {
    throw new Error(translate ? translate("onlyDigits", label) : `${label} должен содержать только цифры`)
  }
  if (compact.length !== 12) {
    throw new Error(translate ? translate("length", label) : `${label} должен состоять из 12 цифр`)
  }
  return compact
}

export function normalizeTenantTaxIds(args: {
  legalType: unknown
  bin?: FormDataEntryValue | string | null
  iin?: FormDataEntryValue | string | null
  /** Подписи «БИН»/«ИИН» на языке интерфейса; по умолчанию русские. */
  labels?: { bin: string; iin: string }
  translate?: TaxIdTranslate
}) {
  const legalType = normalizeTenantLegalType(args.legalType)
  const usesBin = tenantLegalTypeUsesBin(legalType)
  const binLabel = args.labels?.bin ?? "БИН"
  const iinLabel = args.labels?.iin ?? "ИИН"

  if (usesBin) {
    return {
      legalType,
      bin: normalizeTaxId(args.bin, binLabel, args.translate),
      iin: null,
    }
  }

  return {
    legalType,
    bin: null,
    iin: assertKazakhstanIin(args.iin ?? args.bin, iinLabel, args.translate),
  }
}
