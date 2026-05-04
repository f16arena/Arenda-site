export type KzIinValidation = {
  ok: boolean
  value: string
  errors: string[]
  warnings: string[]
  birthDate: Date | null
  gender: "MALE" | "FEMALE" | null
  genderLabel: string | null
}

const FIRST_CYCLE_WEIGHTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const SECOND_CYCLE_WEIGHTS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]

export function normalizeDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "")
}

export function validateKazakhstanIin(value: unknown): KzIinValidation {
  const compact = normalizeDigits(value)
  const errors: string[] = []
  const warnings: string[] = []

  if (!compact) {
    return { ok: true, value: "", errors, warnings, birthDate: null, gender: null, genderLabel: null }
  }

  if (!/^\d+$/.test(String(value ?? "").replace(/\s/g, "")) && String(value ?? "").trim()) {
    errors.push("ИИН должен содержать только цифры")
  }

  if (compact.length !== 12) {
    errors.push("ИИН должен состоять из 12 цифр")
    return { ok: false, value: compact, errors, warnings, birthDate: null, gender: null, genderLabel: null }
  }

  if (/^(\d)\1{11}$/.test(compact)) {
    errors.push("ИИН не может состоять из одной повторяющейся цифры")
  }

  const expectedCheckDigit = calculateIinCheckDigit(compact.slice(0, 11))
  const actualCheckDigit = Number(compact[11])
  if (expectedCheckDigit === null || expectedCheckDigit !== actualCheckDigit) {
    errors.push("Некорректная контрольная цифра ИИН")
  }

  const decoded = decodeLegacyBirthDateAndGender(compact)
  if (!decoded.birthDate) {
    warnings.push("Первые 6 цифр не расшифровываются как классическая дата рождения")
  }
  if (!decoded.gender) {
    warnings.push("7-я цифра не расшифровывается как классический код пола и века")
  }

  return {
    ok: errors.length === 0,
    value: compact,
    errors,
    warnings,
    birthDate: decoded.birthDate,
    gender: decoded.gender,
    genderLabel: decoded.genderLabel,
  }
}

export function assertKazakhstanIin(value: unknown, label = "ИИН") {
  const result = validateKazakhstanIin(value)
  if (!result.value) return null
  if (!result.ok) {
    throw new Error(result.errors[0]?.replace(/^ИИН/, label) ?? `${label} некорректен`)
  }
  return result.value
}

export function formatKzIinBirthDate(date: Date) {
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear()),
  ].join(".")
}

function calculateIinCheckDigit(firstElevenDigits: string) {
  const digits = firstElevenDigits.split("").map(Number)
  if (digits.length !== 11 || digits.some((digit) => !Number.isInteger(digit))) return null

  const first = weightedMod(digits, FIRST_CYCLE_WEIGHTS)
  if (first < 10) return first

  const second = weightedMod(digits, SECOND_CYCLE_WEIGHTS)
  return second < 10 ? second : null
}

function weightedMod(digits: number[], weights: number[]) {
  return digits.reduce((sum, digit, index) => sum + digit * weights[index], 0) % 11
}

function decodeLegacyBirthDateAndGender(iin: string) {
  const yy = Number(iin.slice(0, 2))
  const month = Number(iin.slice(2, 4))
  const day = Number(iin.slice(4, 6))
  const centuryGender = Number(iin[6])

  const centuryStartByDigit: Record<number, number> = {
    1: 1800,
    2: 1800,
    3: 1900,
    4: 1900,
    5: 2000,
    6: 2000,
  }
  const centuryStart = centuryStartByDigit[centuryGender]
  const year = centuryStart !== undefined ? centuryStart + yy : NaN
  const birthDate = makeValidDate(year, month, day)
  const gender: "MALE" | "FEMALE" | null = centuryGender % 2 === 1 && centuryStart !== undefined
    ? "MALE"
    : centuryGender % 2 === 0 && centuryStart !== undefined
      ? "FEMALE"
      : null

  return {
    birthDate,
    gender,
    genderLabel: gender === "MALE" ? "мужчина" : gender === "FEMALE" ? "женщина" : null,
  }
}

function makeValidDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return new Date(year, month - 1, day)
}
