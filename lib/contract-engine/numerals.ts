// Числа прописью (тенге), денежный формат и русские даты.
// Портировано из прототипа commrent-constructor.html.

const ONES = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
const TEENS = [
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
  "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать",
]
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
const HUND = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]

function trio(n: number, fem: boolean): string {
  const s: string[] = []
  s.push(HUND[Math.floor(n / 100)])
  const d = n % 100
  if (d >= 10 && d < 20) {
    s.push(TEENS[d - 10])
  } else {
    s.push(TENS[Math.floor(d / 10)])
    s.push((fem ? ONES_F : ONES)[d % 10])
  }
  return s.filter(Boolean).join(" ")
}

function plural(n: number, forms: [string, string, string]): string {
  let x = n % 100
  if (x >= 11 && x <= 14) return forms[2]
  x = n % 10
  if (x === 1) return forms[0]
  if (x >= 2 && x <= 4) return forms[1]
  return forms[2]
}

/** Целое число тенге прописью. */
export function tengeInWords(value: number): string {
  const n = Math.floor(Math.abs(value || 0))
  if (n === 0) return "ноль тенге"
  const parts: string[] = []
  const mil = Math.floor(n / 1_000_000) % 1000
  const th = Math.floor(n / 1000) % 1000
  const u = n % 1000
  if (mil) parts.push(trio(mil, false) + " " + plural(mil, ["миллион", "миллиона", "миллионов"]))
  if (th) parts.push(trio(th, true) + " " + plural(th, ["тысяча", "тысячи", "тысяч"]))
  if (u) parts.push(trio(u, false))
  const w = parts.join(" ").replace(/\s+/g, " ").trim()
  return w + " " + plural(n, ["тенге", "тенге", "тенге"])
}

/** "1 234 567 ₸" */
export function money(value: number): string {
  return (value || 0).toLocaleString("ru-RU") + " ₸"
}

/** "1 234 567 ₸ (один миллион ... тенге)" */
export function moneyWithWords(value: number): string {
  return money(value) + " (" + tengeInWords(value) + ")"
}

/** Как moneyWithWords, но с тиынами при дробной сумме: "1 777 912,50 ₸ (… тенге 50 тиын)". */
export function moneyWithWordsTiyn(value: number): string {
  const v = Math.round((value || 0) * 100) / 100
  const tiyn = Math.round((v - Math.floor(v)) * 100)
  if (!tiyn) return moneyWithWords(v)
  const num = Math.floor(v).toLocaleString("ru-RU") + "," + String(tiyn).padStart(2, "0") + " ₸"
  return num + " (" + tengeInWords(Math.floor(v)) + " " + String(tiyn).padStart(2, "0") + " тиын)"
}

/** Срок в месяцах: "2 (двух) месяцев", "1 (одного) месяца" — родительный падеж для «в течение …». */
export function monthsGenitive(n: number): string {
  const WORDS = ["", "одного", "двух", "трёх", "четырёх", "пяти", "шести", "семи", "восьми", "девяти", "десяти", "одиннадцати", "двенадцати"]
  const word = WORDS[n] ? ` (${WORDS[n]})` : ""
  return `${n}${word} ${plural(n, ["месяца", "месяцев", "месяцев"])}`
}

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
]

const MONTHS_NOM = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]

/** "YYYY-MM" → "июля 2026 г." (родительный падеж, после «с …»). Невалидное → плейсхолдер. */
export function monthYearGenitive(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec((ym || "").trim())
  if (!m) return "__________ 20__ г."
  const idx = Number(m[2]) - 1
  if (idx < 0 || idx > 11) return "__________ 20__ г."
  return `${MONTHS[idx]} ${m[1]} г.`
}

/** "YYYY-MM" → "июнь 2027 г." (именительный/винительный падеж, после «по …»). */
export function monthYearNominative(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec((ym || "").trim())
  if (!m) return "__________ 20__ г."
  const idx = Number(m[2]) - 1
  if (idx < 0 || idx > 11) return "__________ 20__ г."
  return `${MONTHS_NOM[idx]} ${m[1]} г.`
}

/** ISO-дата → «01» января 2026 г. Пустая → плейсхолдер для ручного заполнения. */
export function dateLong(iso: string | null | undefined): string {
  if (!iso) return "«___» __________ 20__ г."
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `«${String(d.getDate()).padStart(2, "0")}» ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`
}
