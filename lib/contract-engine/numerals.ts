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

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
]

/** ISO-дата → «01» января 2026 г. Пустая → плейсхолдер для ручного заполнения. */
export function dateLong(iso: string | null | undefined): string {
  if (!iso) return "«___» __________ 20__ г."
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `«${String(d.getDate()).padStart(2, "0")}» ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`
}
