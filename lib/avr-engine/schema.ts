// Модель данных конструктора АВР (Акт выполненных работ, гос-форма Р-1).
// Чистый TypeScript, без зависимостей от Next/Prisma — портируемо и тестируемо.
// Поток: AvrState → renderAvrText (строка для подписи) / renderAvrDocx (форма Р-1).

export type AvrPartyType = "too" | "ip" | "individual"

export interface AvrParty {
  type: AvrPartyType
  name: string // полное наименование
  binIin: string // ИИН/БИН
  address: string
  comm: string // данные о средствах связи (телефон/email)
  signatory: string // ФИО подписанта
  position: string // должность
}

export interface AvrItem {
  name: string // наименование работ (услуг)
  date: string // дата выполнения работ (оказания услуг) — текст, напр. «31.05.2026»
  report: string // сведения об отчёте (обычно пусто)
  unit: string // единица измерения
  qty: number
  price: number // цена за единицу
}

export interface AvrState {
  meta: { number: string; date: string; city: string } // дата составления (ISO)
  period: string // YYYY-MM
  contractRef: { number: string; date: string } // договор №/дата (ISO date)
  executor: AvrParty // Исполнитель (арендодатель — оказывает услугу аренды)
  customer: AvrParty // Заказчик (арендатор)
  items: AvrItem[]
  vat: { enabled: boolean; rate: number }
  stocks: string // сведения об использовании запасов, полученных от заказчика
  attachmentPages: number // приложение: перечень документации на N страниц
}

export function itemSum(it: AvrItem): number {
  return Math.round((it.qty || 0) * (it.price || 0))
}
export function avrSubtotal(s: AvrState): number {
  return s.items.reduce((sum, it) => sum + itemSum(it), 0)
}
export function avrVat(s: AvrState): number {
  return s.vat.enabled ? Math.round((avrSubtotal(s) * s.vat.rate) / 100) : 0
}
export function avrTotal(s: AvrState): number {
  return avrSubtotal(s) + avrVat(s)
}

export function defaultAvrParty(): AvrParty {
  return { type: "too", name: "", binIin: "", address: "", comm: "", signatory: "", position: "Директор" }
}

export function defaultAvrState(): AvrState {
  return {
    meta: { number: "", date: "", city: "г. Усть-Каменогорск" },
    period: "",
    contractRef: { number: "", date: "" },
    executor: defaultAvrParty(),
    customer: defaultAvrParty(),
    items: [],
    vat: { enabled: false, rate: 16 },
    stocks: "",
    attachmentPages: 0,
  }
}

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
]

/** «май 2026 г.» из «2026-05». */
export function periodLabel(period: string): string {
  const [y, m] = (period || "").split("-").map(Number)
  if (!y || !m || m < 1 || m > 12) return period || "—"
  return `${MONTHS_GEN[m - 1]} ${y} г.`
}

/** Последний день месяца периода в формате ДД.ММ.ГГГГ (дата оказания услуг). */
export function periodEndDate(period: string): string {
  const [y, m] = (period || "").split("-").map(Number)
  if (!y || !m) return ""
  const d = new Date(y, m, 0)
  return `${String(d.getDate()).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`
}
