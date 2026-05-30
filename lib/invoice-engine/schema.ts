// Модель данных конструктора «Счёт на оплату» (свободная форма РК).
// Чистый TS, без зависимостей от фреймворка. Поток как у АВР:
// InvoiceState → renderInvoiceText (строка) / renderInvoiceDocx (DOCX).

export type InvoicePartyType = "too" | "ip" | "individual"

export interface InvoiceSeller {
  type: InvoicePartyType
  name: string
  binIin: string
  address: string
  bank: string
  iik: string
  bik: string
  kbe: string
  knp: string
  signatory: string
  signatoryPosition: string
}

export interface InvoiceBuyer {
  type: InvoicePartyType
  name: string
  binIin: string
  address: string
  bank: string
  iik: string
  bik: string
}

export interface InvoiceItem {
  name: string
  unit: string
  qty: number
  price: number
}

export interface InvoiceState {
  meta: { number: string; date: string; city: string } // дата выставления (ISO)
  period: string // YYYY-MM
  contractRef: { number: string; date: string }
  dueDate: string // оплатить до (ISO)
  seller: InvoiceSeller // Поставщик (арендодатель/организация)
  buyer: InvoiceBuyer // Получатель (арендатор)
  items: InvoiceItem[]
  vat: { enabled: boolean; rate: number }
}

export function itemSum(it: InvoiceItem): number {
  return Math.round((it.qty || 0) * (it.price || 0))
}
export function invSubtotal(s: InvoiceState): number {
  return s.items.reduce((sum, it) => sum + itemSum(it), 0)
}
export function invVat(s: InvoiceState): number {
  return s.vat.enabled ? Math.round((invSubtotal(s) * s.vat.rate) / 100) : 0
}
export function invTotal(s: InvoiceState): number {
  return invSubtotal(s) + invVat(s)
}

export function defaultInvoiceSeller(): InvoiceSeller {
  return { type: "too", name: "", binIin: "", address: "", bank: "", iik: "", bik: "", kbe: "", knp: "", signatory: "", signatoryPosition: "Директор" }
}
export function defaultInvoiceBuyer(): InvoiceBuyer {
  return { type: "too", name: "", binIin: "", address: "", bank: "", iik: "", bik: "" }
}
export function defaultInvoiceState(): InvoiceState {
  return {
    meta: { number: "", date: "", city: "г. Усть-Каменогорск" },
    period: "",
    contractRef: { number: "", date: "" },
    dueDate: "",
    seller: defaultInvoiceSeller(),
    buyer: defaultInvoiceBuyer(),
    items: [],
    vat: { enabled: false, rate: 16 },
  }
}
