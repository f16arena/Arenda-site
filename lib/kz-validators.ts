// Валидаторы реквизитов Республики Казахстан.
//
// ИИК (KZ IBAN): KZxx + 3 цифры банка + 13 символов счёта = 20 символов.
//   Валидация по mod-97 IBAN-алгоритму ISO 13616.
// БИН: 12 цифр, контрольная цифра по ГОСТ РК (ЭКО ДРАМ).
// ИИН: 12 цифр, тот же ГОСТ РК + первые 6 цифр = ДДММГГ дата рождения.

import { findBankByBik, isValidBikFormat } from "./kz-banks"

// ─── ИИК (IBAN) ──────────────────────────────────────────────────

export function normalizeIik(iik: string): string {
  return iik.replace(/\s+/g, "").toUpperCase()
}

export function isValidIikFormat(iik: string): boolean {
  const v = normalizeIik(iik)
  // KZ + 2 контрольные + 3 банк + 13 счёт = 20
  return /^KZ[0-9]{2}[A-Z0-9]{3}[A-Z0-9]{13}$/.test(v)
}

/** mod-97 проверка ISO 13616 (стандартный IBAN). */
export function isValidIikChecksum(iik: string): boolean {
  const v = normalizeIik(iik)
  if (!isValidIikFormat(v)) return false
  // Переставляем первые 4 символа в конец и переводим буквы в числа
  const rearranged = v.slice(4) + v.slice(0, 4)
  let numeric = ""
  for (const ch of rearranged) {
    if (ch >= "0" && ch <= "9") {
      numeric += ch
    } else {
      // A=10, B=11, ..., Z=35
      numeric += String(ch.charCodeAt(0) - 55)
    }
  }
  // mod-97 на длинном числе — считаем кусками, чтобы не переполнить Number
  let remainder = 0
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = String(remainder) + numeric.slice(i, i + 7)
    remainder = Number(chunk) % 97
  }
  return remainder === 1
}

/** Извлечь 3-значный код банка из ИИК (4-й, 5-й, 6-й символы). */
export function extractBankCodeFromIik(iik: string): string | null {
  const v = normalizeIik(iik)
  if (!/^KZ[0-9]{2}/.test(v) || v.length < 7) return null
  return v.slice(4, 7)
}

// ─── БИН / ИИН ───────────────────────────────────────────────────

const BIN_W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const BIN_W2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]

/** Контрольная цифра БИН/ИИН по ГОСТ РК. Используется для обоих. */
function calcCheckDigit(digits: number[]): number {
  if (digits.length !== 11) return -1
  let sum = digits.reduce((s, d, i) => s + d * BIN_W1[i], 0)
  let check = sum % 11
  if (check === 10) {
    sum = digits.reduce((s, d, i) => s + d * BIN_W2[i], 0)
    check = sum % 11
    if (check === 10) return -1
  }
  return check
}

export function isValidBin(bin: string): boolean {
  const v = bin.replace(/\s+/g, "")
  if (!/^[0-9]{12}$/.test(v)) return false
  const digits = v.split("").map(Number)
  const expected = calcCheckDigit(digits.slice(0, 11))
  if (expected < 0) return false
  return expected === digits[11]
}

export function isValidIin(iin: string): boolean {
  const v = iin.replace(/\s+/g, "")
  if (!/^[0-9]{12}$/.test(v)) return false
  // Первые 6 цифр — ДДММГГ. Год — 19YY/20YY определяется по 7-й цифре.
  const yy = parseInt(v.slice(0, 2))
  const mm = parseInt(v.slice(2, 4))
  const dd = parseInt(v.slice(4, 6))
  if (mm < 1 || mm > 12) return false
  if (dd < 1 || dd > 31) return false
  if (yy < 0 || yy > 99) return false
  // Контрольная цифра
  const digits = v.split("").map(Number)
  const expected = calcCheckDigit(digits.slice(0, 11))
  if (expected < 0) return false
  return expected === digits[11]
}

// ─── Сводный валидатор ────────────────────────────────────────────

/**
 * Ключ подписи в словаре (common.requisiteChecks.*), а не готовый текст:
 * валидатор — чистая функция, языка пользователя он не знает.
 */
export type CheckKey =
  | "bikFormat"
  | "bikUnknown"
  | "iikFormat"
  | "iikChecksum"
  | "binDigits"
  | "binChecksum"
  | "iinDigits"
  | "iinChecksum"

export type RequisitesCheck = {
  bik: { ok: boolean; bankName?: string; warningKey?: CheckKey } | null
  iik: { ok: boolean; warningKey?: CheckKey } | null
  bin: { ok: boolean; warningKey?: CheckKey } | null
  iin: { ok: boolean; warningKey?: CheckKey } | null
  // Дополнительная проверка соответствия БИК и ИИК (банк-код в ИИК должен соотв. БИК)
  consistency: { ok: boolean; warningKey?: CheckKey } | null
}

export function validateRequisites(input: {
  bik?: string
  iik?: string
  bin?: string
  iin?: string
}): RequisitesCheck {
  const result: RequisitesCheck = {
    bik: null, iik: null, bin: null, iin: null, consistency: null,
  }

  if (input.bik) {
    const bank = findBankByBik(input.bik)
    if (!isValidBikFormat(input.bik)) {
      result.bik = {
        ok: false,
        warningKey: "bikFormat",
      }
    } else if (bank) {
      result.bik = { ok: true, bankName: bank.short }
    } else {
      result.bik = {
        ok: true,
        warningKey: "bikUnknown",
      }
    }
  }

  if (input.iik) {
    if (!isValidIikFormat(input.iik)) {
      result.iik = { ok: false, warningKey: "iikFormat" }
    } else if (!isValidIikChecksum(input.iik)) {
      result.iik = { ok: false, warningKey: "iikChecksum" }
    } else {
      result.iik = { ok: true }
    }
  }

  if (input.bin) {
    if (!/^[0-9]{12}$/.test(input.bin.replace(/\s+/g, ""))) {
      result.bin = { ok: false, warningKey: "binDigits" }
    } else if (!isValidBin(input.bin)) {
      result.bin = { ok: false, warningKey: "binChecksum" }
    } else {
      result.bin = { ok: true }
    }
  }

  if (input.iin) {
    if (!/^[0-9]{12}$/.test(input.iin.replace(/\s+/g, ""))) {
      result.iin = { ok: false, warningKey: "iinDigits" }
    } else if (!isValidIin(input.iin)) {
      result.iin = { ok: false, warningKey: "iinChecksum" }
    } else {
      result.iin = { ok: true }
    }
  }

  // В ИИК РК после контрольных цифр идет цифровой код банка, а БИК/SWIFT
  // начинается с букв. Без официальной таблицы соответствия нельзя надежно
  // блокировать пару БИК + ИИК, поэтому здесь проверяем формат и checksum IBAN,
  // а не делаем ложное сравнение с первыми буквами БИК.

  return result
}
