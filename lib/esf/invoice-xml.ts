import "server-only"

/**
 * Генерация XML электронной счёт-фактуры (ЭСФ, форма InvoiceV2) для ИС ЭСФ КГД РК.
 * Схема: api-wsdl/xsd/Invoice/InvoiceV2.xsd (targetNamespace "v2.esf",
 * база abstractInvoice.esf). Порядок элементов СТРОГО по XSD (xs:sequence):
 * сначала поля AbstractInvoice (date, invoiceType, num, operatorFullname,
 * turnoverDate), затем поля V2 в порядке схемы (customers → deliveryDoc* →
 * deliveryTerm → productSet → sellers).
 *
 * Модель проверена на реальном ручном ЭСФ по аренде (см. InvoicePrintReport):
 *   труOriginCode=6 (работа/услуга), без ТН ВЭД/unitCode, ед.изм «Одна услуга»,
 *   «Без НДС» = опускаем ndsRate, ndsAmount=0, catalogTruId="1".
 *
 * Даты — dd.MM.yyyy. Тело идёт в invoiceBody (syncInvoice) БЕЗ xml-пролога.
 */

export interface InvoiceParty {
  /** ИИН/БИН (12 цифр) */
  tin: string
  name: string
  address?: string | null
  countryCode?: string | null
  bank?: string | null
  bik?: string | null
  iik?: string | null
  kbe?: string | null
}

export interface InvoiceLineItem {
  /** Наименование ТРУ (G3) */
  name: string
  /** Кол-во (объём) (G8) */
  quantity: number
  /** Цена за единицу без косвенных налогов (G10) */
  unitPriceWithoutTax: number
  /** Стоимость без косвенных налогов (G11) */
  priceWithoutTax: number
  /** Ставка НДС, % (для «Без НДС» элемент опускается) */
  ndsRate: number | null
  /** Сумма НДС (G16), обязательна — 0 если без НДС */
  ndsAmount: number
  /** Стоимость с учётом НДС (G17) */
  priceWithTax: number
}

export interface InvoiceXmlInput {
  /** Исходящий номер ЭСФ — только цифры (A1), 1–30 знаков */
  number: string
  /** Дата выписки (A2) */
  issueDate: Date
  /** Дата совершения оборота (A3) */
  turnoverDate: Date
  /** ФИО лица, выписывающего ЭСФ (оператора) */
  operatorFullname: string
  /** Договор-основание (E27): включаем deliveryTerm если есть */
  contract?: { number?: string | null; date?: Date | null } | null
  /** Документ-основание поставки (F32): счёт */
  deliveryDoc?: { number?: string | null; date?: Date | null } | null
  /** Способ расчёта (E28). По умолчанию безналичный (типично для аренды). */
  paymentForm?: "CASH" | "NON_CASH"
  seller: InvoiceParty & {
    /** Свидетельство НДС (B9) — для плательщика НДС */
    certificateSeries?: string | null
    certificateNum?: string | null
  }
  customer: InvoiceParty
  items: InvoiceLineItem[]
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

// КГД ФЛК запрещает «незначащие нули»: 600000.00 → "600000", 1200.50 → "1200.5",
// 0.00 → "0". Округляем до 2 знаков и отдаём минимальное представление.
function money(n: number): string {
  return String(Math.round(n * 100) / 100)
}

function tag(name: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return ""
  return `<${name}>${esc(value)}</${name}>`
}

/** Реквизиты получателя (C). Порядок по XSD Customer. */
function customerXml(c: InvoiceParty): string {
  return "<customer>"
    + tag("address", c.address)
    + `<countryCode>${esc(c.countryCode || "KZ")}</countryCode>`
    + tag("name", c.name)
    + tag("tin", c.tin)
    + "</customer>"
}

/** Реквизиты поставщика (B + B1). Порядок по XSD Seller. */
function sellerXml(s: InvoiceXmlInput["seller"]): string {
  return "<seller>"
    + tag("address", s.address)
    + tag("bank", s.bank)
    + tag("bik", s.bik)
    + tag("certificateNum", s.certificateNum)
    + tag("certificateSeries", s.certificateSeries)
    + tag("iik", s.iik)
    + tag("kbe", s.kbe)
    + tag("name", s.name)
    + tag("tin", s.tin)
    + "</seller>"
}

/** Один товар/услуга (G). Порядок полей по XSD Product (для услуги). */
function productXml(p: InvoiceLineItem): string {
  return "<product>"
    + "<catalogTruId>1</catalogTruId>"
    + tag("description", p.name)
    + `<ndsAmount>${money(p.ndsAmount)}</ndsAmount>`
    + (p.ndsRate != null ? `<ndsRate>${Math.round(p.ndsRate)}</ndsRate>` : "")
    + `<priceWithTax>${money(p.priceWithTax)}</priceWithTax>`
    + `<priceWithoutTax>${money(p.priceWithoutTax)}</priceWithoutTax>`
    + `<quantity>${p.quantity}</quantity>`
    // Признак происхождения: 6 — работа/услуга (без ТН ВЭД/unitCode)
    + "<truOriginCode>6</truOriginCode>"
    + `<turnoverSize>${money(p.priceWithoutTax)}</turnoverSize>`
    // Ед.изм (G6) — код справочника единиц измерения КГД (ОКЕИ), а НЕ текст и не
    // пусто (иначе INVALID_MEASURE_UNIT_CODE). 796 = «штука» (ОКЕИ) — есть в
    // справочнике, как в эталонном примере SDK; для услуги кол-во = 1.
    + "<unitNomenclature>796</unitNomenclature>"
    + `<unitPrice>${money(p.unitPriceWithoutTax)}</unitPrice>`
    + "</product>"
}

/** Условия поставки (E) — включаем только при наличии договора. */
function deliveryTermXml(input: InvoiceXmlInput): string {
  const c = input.contract
  if (!c || (!c.number && !c.date)) return ""
  // ВНИМАНИЕ: боевая схема КГД отличается от SDK-XSD — у DeliveryTerm НЕТ
  // элемента paymentForm (две живые ошибки ФЛК исключили его и до, и после
  // hasContract). Реальный порядок: contractDate, contractNum,
  // deliveryConditionCode, [destination], hasContract, [term, transportTypeCode,
  // warrant, warrantDate].
  return "<deliveryTerm>"
    + (c.date ? `<contractDate>${fmtDate(c.date)}</contractDate>` : "")
    + tag("contractNum", c.number)
    + "<deliveryConditionCode>XXX</deliveryConditionCode>"
    + "<hasContract>true</hasContract>"
    + "<transportTypeCode>99</transportTypeCode>"
    + "</deliveryTerm>"
}

/** Сборка XML ЭСФ. Возвращает строку БЕЗ xml-пролога (так шлют в invoiceBody). */
export function buildInvoiceXml(input: InvoiceXmlInput): string {
  const totalNds = input.items.reduce((s, p) => s + (p.ndsAmount || 0), 0)
  const totalWithTax = input.items.reduce((s, p) => s + p.priceWithTax, 0)
  const totalWithoutTax = input.items.reduce((s, p) => s + p.priceWithoutTax, 0)

  const products = input.items.map(productXml).join("")

  const dd = input.deliveryDoc
  const deliveryDocXml =
    (dd?.date ? `<deliveryDocDate>${fmtDate(dd.date)}</deliveryDocDate>` : "")
    + tag("deliveryDocNum", dd?.number)

  // Порядок V2: customers → deliveryDocDate? → deliveryDocNum? → deliveryTerm? →
  // productSet → sellers.
  // ВАЖНО: namespace v2.esf вешаем ПРЕФИКСОМ на корень (xmlns:v2), а НЕ дефолтным
  // (xmlns="v2.esf"). Дочерние элементы в InvoiceV2 — unqualified (без namespace),
  // иначе валидатор КГД ругается: «Invalid content … '{v2.esf}date' … One of '{date}'».
  return `<v2:invoice xmlns:a="abstractInvoice.esf" xmlns:v2="v2.esf">`
    + `<date>${fmtDate(input.issueDate)}</date>`
    + "<invoiceType>ORDINARY_INVOICE</invoiceType>"
    + `<num>${esc(input.number)}</num>`
    + `<operatorFullname>${esc(input.operatorFullname.slice(0, 200))}</operatorFullname>`
    + `<turnoverDate>${fmtDate(input.turnoverDate)}</turnoverDate>`
    + `<customers>${customerXml(input.customer)}</customers>`
    + deliveryDocXml
    + deliveryTermXml(input)
    + "<productSet>"
    + "<currencyCode>KZT</currencyCode>"
    + `<products>${products}</products>`
    + "<totalExciseAmount>0</totalExciseAmount>"
    + `<totalNdsAmount>${money(totalNds)}</totalNdsAmount>`
    + `<totalPriceWithTax>${money(totalWithTax)}</totalPriceWithTax>`
    + `<totalPriceWithoutTax>${money(totalWithoutTax)}</totalPriceWithoutTax>`
    + `<totalTurnoverSize>${money(totalWithoutTax)}</totalTurnoverSize>`
    + "</productSet>"
    + `<sellers>${sellerXml(input.seller)}</sellers>`
    + "</v2:invoice>"
}
