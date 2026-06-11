import "server-only"

/**
 * Генерация XML электронного АВР (форма AwpV1) для ИС ЭСФ КГД РК.
 * Схема: docs/esf-sdk/api-wsdl/xsd/Awp/AwpV1.xsd (targetNamespace "v1.awp").
 *
 * Порядок элементов строго по XSD (extension: сначала поля AbstractAwp,
 * затем additionalInfo → contract → recipients → senders → worksPerformed).
 * Даты — в формате dd.MM.yyyy (как в UI ИС ЭСФ).
 */

export interface AwpParty {
  /** ИИН/БИН */
  tin: string
  name: string
  address?: string | null
  /** Банковские реквизиты */
  bank?: string | null
  bik?: string | null
  iik?: string | null
  kbe?: number | null
}

export interface AwpWorkItem {
  name: string
  quantity?: number | null
  /** Цена за единицу без налогов */
  unitPriceWithoutTax: number
  /** Стоимость без косвенных налогов */
  sumWithoutTax: number
  /** Ставка НДС, % (0 — без НДС) */
  ndsRate: number
  /** Сумма НДС */
  ndsAmount?: number | null
  /** Стоимость с учётом косвенных налогов */
  sumWithTax: number
}

export interface AwpXmlInput {
  /** Номер АВР в учётной системе (наш номер документа) */
  number: string
  /** Дата выписки */
  issueDate: Date
  /** Дата выполнения работ (оказания услуг) — обычно последний день месяца */
  performedDate: Date
  /** Договор-основание */
  contract: { number: string; date: Date | null }
  sender: AwpParty
  recipient: AwpParty & {
    /** ENTERPRISE | ENTREPRENEUR | INDIVIDUAL */
    registrationType?: "ENTERPRISE" | "ENTREPRENEUR" | "INDIVIDUAL"
  }
  items: AwpWorkItem[]
  additionalInfo?: string | null
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}.${mm}.${d.getFullYear()}`
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2)
}

function tag(name: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return ""
  return `<${name}>${esc(value)}</${name}>`
}

function bankDetailsXml(p: AwpParty): string {
  if (!p.bank && !p.bik && !p.iik) return ""
  return `<bankDetails>${tag("bank", p.bank)}${tag("bik", p.bik)}${tag("iik", p.iik)}${p.kbe ? `<kbe>${p.kbe}</kbe>` : ""}</bankDetails>`
}

/** Сборка XML АВР. Возвращает строку БЕЗ xml-пролога (так шлют в awpBody). */
export function buildAwpXml(input: AwpXmlInput): string {
  const totalWithoutTax = input.items.reduce((s, w) => s + w.sumWithoutTax, 0)
  const totalNds = input.items.reduce((s, w) => s + (w.ndsAmount ?? 0), 0)
  const totalWithTax = input.items.reduce((s, w) => s + w.sumWithTax, 0)

  const works = input.items.map((w) => {
    // Порядок полей AwpWork по XSD: additionalInfo?, measureUnitCode?, name,
    // ndsAmount?, ndsRate, quantity?, sumWithTax, sumWithoutTax, turnoverSize, unitPriceWithoutTax
    return "<work>"
      + tag("name", w.name)
      + (w.ndsAmount != null ? `<ndsAmount>${money(w.ndsAmount)}</ndsAmount>` : "")
      + `<ndsRate>${Math.round(w.ndsRate)}</ndsRate>`
      + (w.quantity != null ? `<quantity>${w.quantity}</quantity>` : "")
      + `<sumWithTax>${money(w.sumWithTax)}</sumWithTax>`
      + `<sumWithoutTax>${money(w.sumWithoutTax)}</sumWithoutTax>`
      + `<turnoverSize>${money(w.sumWithoutTax)}</turnoverSize>`
      + `<unitPriceWithoutTax>${money(w.unitPriceWithoutTax)}</unitPriceWithoutTax>`
      + "</work>"
  }).join("")

  // abstractAwpParticipant: additionalInfo?, address?, branchTin?, invitationEmail?, tin?
  const recipient = "<recipient>"
    + tag("address", input.recipient.address)
    + tag("tin", input.recipient.tin)
    + bankDetailsXml(input.recipient)
    + tag("name", input.recipient.name)
    + "<nonResident>false</nonResident>"
    + tag("registrationType", input.recipient.registrationType)
    + "</recipient>"

  const sender = "<sender>"
    + tag("address", input.sender.address)
    + tag("tin", input.sender.tin)
    + bankDetailsXml(input.sender)
    + tag("name", input.sender.name)
    + "</sender>"

  // AbstractAwp: date, number, performedDate, registrationNumber?
  // AwpV1 extension: additionalInfo?, contract, recipients?, senders?, worksPerformed?
  return `<awp xmlns="v1.awp">`
    + `<date>${fmtDate(input.issueDate)}</date>`
    + tag("number", input.number)
    + `<performedDate>${fmtDate(input.performedDate)}</performedDate>`
    + tag("additionalInfo", input.additionalInfo)
    + "<contract>"
    + (input.contract.date ? `<date>${fmtDate(input.contract.date)}</date>` : "")
    + "<isContract>true</isContract>"
    + tag("number", input.contract.number)
    + "</contract>"
    + `<recipients>${recipient}</recipients>`
    + `<senders>${sender}</senders>`
    + "<worksPerformed>"
    + "<currencyCode>KZT</currencyCode>"
    + `<totalNdsAmount>${money(totalNds)}</totalNdsAmount>`
    + `<totalSumWithTax>${money(totalWithTax)}</totalSumWithTax>`
    + `<totalSumWithoutTax>${money(totalWithoutTax)}</totalSumWithoutTax>`
    + `<totalTurnoverSize>${money(totalWithoutTax)}</totalTurnoverSize>`
    + `<works>${works}</works>`
    + "</worksPerformed>"
    + "</awp>"
}
