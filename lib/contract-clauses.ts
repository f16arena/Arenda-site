import { calculateTenantMonthlyRent, calculateTenantRatePerSqm, hasFixedTenantRent } from "@/lib/rent"

type LeaseRentTenant = {
  fixedMonthlyRent?: number | null
  customRate?: number | null
  space?: {
    area: number
    floor: { ratePerSqm: number }
  } | null
  tenantSpaces?: Array<{
    space: {
      area: number
      floor: { ratePerSqm: number }
    }
  }> | null
  fullFloors?: Array<{
    name?: string | null
    totalArea?: number | null
    fixedMonthlyRent: number | null
  }> | null
}

export const LEASE_PROLONGATION_CLAUSE =
  "2.2. По истечении срока Договора его действие не продлевается автоматически. Продление аренды, изменение срока, размера арендной платы, индексации и иных существенных условий оформляются только путем подписания Сторонами нового договора либо дополнительного соглашения до даты окончания настоящего Договора. При отсутствии подписанного документа Арендатор обязан освободить и вернуть Помещение по акту приема-передачи в дату окончания Договора, если Стороны письменно не согласовали иной порядок."

export const LEASE_ESF_CLAUSE =
  "3.5. При наличии обязанности по выписке счета-фактуры Арендодатель оформляет счет-фактуру в электронной форме в ИС ЭСФ в сроки и порядке, предусмотренные налоговым законодательством Республики Казахстан. В стандартном случае счет-фактура выписывается не ранее даты совершения оборота по реализации и не позднее 15 (пятнадцати) календарных дней после такой даты; по коммунальным услугам и иным операциям со специальным сроком - не позднее срока, установленного Налоговым кодексом. Счет на оплату является платежным документом и не заменяет счет-фактуру, если ее выписка обязательна. Если по налоговому режиму Арендодателя или характеру операции счет-фактура не подлежит выписке, Арендодатель выставляет счет на оплату и акт оказанных услуг/выполненных работ. Невыставление счета на оплату не освобождает Арендатора от обязанности внести арендную плату в срок, установленный Договором."

export const LEASE_ADDITIONAL_SERVICES_CLAUSE =
  "3.6. В арендную плату не включаются дополнительные услуги, подключаемые по заявке или отдельному соглашению Арендатора: телефонная линия, доступ в интернет, размещение наружной рекламы, место для видеокамеры, уборка внутри Помещения, вывоз мусора и иные услуги, прямо согласованные Сторонами."

export function buildLeaseRentClause({
  tenant,
  area,
  placement,
  fullFloorName,
  monthlyRent,
  ratePerSqm,
  clauseNumber = "3.1.",
}: {
  tenant: LeaseRentTenant
  area?: number | null
  placement?: string | null
  fullFloorName?: string | null
  monthlyRent?: number | null
  ratePerSqm?: number | null
  clauseNumber?: string
}) {
  const rent = positive(monthlyRent) ?? calculateTenantMonthlyRent(tenant)
  const rate = positive(ratePerSqm) ?? calculateTenantRatePerSqm(tenant) ?? 0
  const actualArea = positive(area) ?? calculateTenantArea(tenant)
  const areaText = actualArea > 0 ? ` общей площадью ${formatAreaRu(actualArea)} кв.м.` : ""
  const rentWithWords = `${formatMoneyRu(rent)} (${numberToWordsRu(rent)})`
  const floorRent = hasFixedTenantRent(tenant.fullFloors?.[0]?.fixedMonthlyRent)

  if (floorRent) {
    const floorLabel = fullFloorName ? `этажа "${fullFloorName}"` : "этажа"
    return `${clauseNumber} Размер арендной платы за аренду ${floorLabel}${areaText} по соглашению Сторон составляет ${rentWithWords} тенге в месяц.`
  }

  if (hasFixedTenantRent(tenant.fixedMonthlyRent)) {
    const objectLabel = placement ? `Помещения (${placement})` : "Помещения"
    return `${clauseNumber} Размер арендной платы за аренду ${objectLabel}${areaText} по соглашению Сторон составляет ${rentWithWords} тенге в месяц и не зависит от ставки за 1 кв.м.`
  }

  const areaPart = actualArea > 0
    ? `; при площади ${formatAreaRu(actualArea)} кв.м. ежемесячная арендная плата составляет ${rentWithWords} тенге`
    : `, а ежемесячная арендная плата составляет ${rentWithWords} тенге`

  return `${clauseNumber} Размер арендной платы определяется исходя из ставки ${formatMoneyRu(rate)} тенге за 1 кв.м. в месяц${areaPart}.`
}

export function getLeaseRentBasisLabel(tenant: LeaseRentTenant) {
  if (hasFixedTenantRent(tenant.fullFloors?.[0]?.fixedMonthlyRent)) return "аренда целого этажа"
  if (hasFixedTenantRent(tenant.fixedMonthlyRent)) return "фиксированная сумма в месяц"
  if (hasFixedTenantRent(tenant.customRate)) return "индивидуальная ставка за 1 кв.м."
  return "ставка этажа за 1 кв.м."
}

export function formatMoneyRu(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value).replace(/[\u00a0\u202f]/g, " ")
}

export function formatAreaRu(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(value).replace(/[\u00a0\u202f]/g, " ")
}

export function numberToWordsRu(value: number) {
  const rounded = Math.trunc(Math.abs(value))
  if (rounded === 0) return "ноль"

  const groups = [
    { value: 1_000_000_000, forms: ["миллиард", "миллиарда", "миллиардов"] as const, gender: "male" as const },
    { value: 1_000_000, forms: ["миллион", "миллиона", "миллионов"] as const, gender: "male" as const },
    { value: 1_000, forms: ["тысяча", "тысячи", "тысяч"] as const, gender: "female" as const },
  ]
  let rest = rounded
  const parts: string[] = []

  for (const group of groups) {
    const chunk = Math.floor(rest / group.value)
    if (chunk > 0) {
      parts.push(`${chunkToWords(chunk, group.gender)} ${plural(chunk, group.forms)}`)
      rest %= group.value
    }
  }

  if (rest > 0) parts.push(chunkToWords(rest, "male"))

  return parts.join(" ")
}

function calculateTenantArea(tenant: LeaseRentTenant) {
  const fullFloorArea = positive(tenant.fullFloors?.[0]?.totalArea)
  if (fullFloorArea !== null) return fullFloorArea

  const tenantSpaces = tenant.tenantSpaces?.map((item) => item.space).filter(Boolean) ?? []
  if (tenantSpaces.length > 0) {
    return tenantSpaces.reduce((sum, space) => sum + space.area, 0)
  }

  return tenant.space?.area ?? 0
}

function positive(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

function chunkToWords(value: number, gender: "male" | "female") {
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
  const maleOnes = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
  const femaleOnes = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]

  const words: string[] = []
  const h = Math.floor(value / 100)
  const t = Math.floor((value % 100) / 10)
  const o = value % 10

  if (h) words.push(hundreds[h])
  if (t === 1) {
    words.push(teens[o])
  } else {
    if (t) words.push(tens[t])
    if (o) words.push((gender === "female" ? femaleOnes : maleOnes)[o])
  }

  return words.join(" ")
}

function plural(value: number, forms: readonly [string, string, string]) {
  const mod100 = value % 100
  const mod10 = value % 10
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}
