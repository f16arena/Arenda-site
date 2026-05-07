const LEGAL_NAME_MARKERS = new Set([
  "ао",
  "бц",
  "гк",
  "ип",
  "кх",
  "ооо",
  "оо",
  "тк",
  "тоо",
  "трц",
  "чси",
])

export function formatPersonShortName(value: string | null | undefined, fallback = "Профиль") {
  const normalized = normalizeName(value)
  if (!normalized) return fallback

  if (looksLikeCompanyName(normalized)) return normalized

  const parts = normalized.split(" ").filter(Boolean)
  if (parts.length < 2) return normalized

  const [lastName, firstName, patronymic] = parts
  const firstInitial = getInitial(firstName)
  if (!firstInitial) return normalized

  const patronymicInitial = getInitial(patronymic)
  return `${lastName} ${firstInitial}.${patronymicInitial ? `${patronymicInitial}.` : ""}`
}

export function getDisplayInitial(value: string | null | undefined, fallback = "П") {
  const normalized = normalizeName(value)
  return getInitial(normalized) || fallback
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ")
}

function looksLikeCompanyName(value: string) {
  if (/[0-9@«»"“”]/.test(value)) return true

  const firstToken = normalizeToken(value.split(" ")[0])
  if (LEGAL_NAME_MARKERS.has(firstToken)) return true

  return value
    .split(" ")
    .map(normalizeToken)
    .some((token) => LEGAL_NAME_MARKERS.has(token))
}

function normalizeToken(value: string | undefined) {
  return (value ?? "")
    .replace(/[.,()[\]{}:;№#]/g, "")
    .toLowerCase()
}

function getInitial(value: string | null | undefined) {
  const match = normalizeName(value).match(/\p{L}/u)
  return match?.[0]?.toUpperCase() ?? ""
}
