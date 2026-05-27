type TenantRentInput = {
  fixedMonthlyRent?: number | null
  customRate?: number | null
  contractStart?: Date | string | null
  contractEnd?: Date | string | null
  /** Фактическая дата заселения. Если задана — используется как точка
   *  отсчёта для proration и каникул вместо contractStart. Раньше эти
   *  две даты совпадали; разделены 2026-05-27. */
  moveInDate?: Date | string | null
  paymentDueDay?: number | null
  /** Арендные каникулы — первые N месяцев после moveInDate (или contractStart
   *  если moveInDate не задан) без начисления. По умолчанию 0. */
  rentFreeMonths?: number | null
  space?: {
    area: number
    floor: {
      ratePerSqm: number
    }
  } | null
  tenantSpaces?: Array<{
    space: {
      area: number
      floor: {
        ratePerSqm: number
      }
    }
  }> | null
  fullFloors?: Array<{
    fixedMonthlyRent: number | null
  }> | null
}

export type RentMode = "FLOOR" | "RATE" | "FIXED"

export type TenantRentChargeSchedule = {
  shouldCreate: boolean
  amount: number
  monthlyRent: number
  dueDate: Date
  isProrated: boolean
  prorationDays: number | null
  prorationStart: Date | null
  prorationEnd: Date | null
  skippedReason?: "NO_RENT" | "BEFORE_CONTRACT_START" | "AFTER_CONTRACT_END" | "FIRST_PERIOD_ALREADY_COVERED" | "RENT_FREE_PERIOD"
}

function positiveAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

function rentableSpaces(tenant: TenantRentInput) {
  const spaces = tenant.tenantSpaces?.map((item) => item.space).filter(Boolean) ?? []
  if (spaces.length > 0) return spaces
  return tenant.space ? [tenant.space] : []
}

export function calculateTenantMonthlyRent(tenant: TenantRentInput) {
  const tenantFixedRent = positiveAmount(tenant.fixedMonthlyRent)
  if (tenantFixedRent !== null) return tenantFixedRent

  const fullFloorFixedRent = (tenant.fullFloors ?? []).reduce((sum, floor) => {
    return sum + (positiveAmount(floor.fixedMonthlyRent) ?? 0)
  }, 0)
  if (fullFloorFixedRent > 0) return fullFloorFixedRent

  const spaces = rentableSpaces(tenant)
  if (spaces.length === 0) return 0

  const customRate = positiveAmount(tenant.customRate)
  return spaces.reduce((sum, space) => {
    const rate = customRate ?? space.floor.ratePerSqm
    return sum + space.area * rate
  }, 0)
}

export function calculateTenantRentChargeForPeriod(
  tenant: TenantRentInput,
  period: string,
): TenantRentChargeSchedule {
  const monthlyRent = calculateTenantMonthlyRent(tenant)
  const { year, monthIndex } = parseRentPeriod(period)
  const paymentDueDay = normalizePaymentDueDay(tenant.paymentDueDay)
  const accountingDueDay = normalizeThirtyDay(paymentDueDay)
  const regularDueDate = getDueDate(year, monthIndex, paymentDueDay)

  if (monthlyRent <= 0) {
    return skippedRentSchedule(monthlyRent, regularDueDate, "NO_RENT")
  }

  // Используем moveInDate для proration и каникул если задан, иначе contractStart.
  // contractEnd НЕ заменяется на moveInDate — окончание = по контракту.
  const contractStart = toLocalDate(tenant.moveInDate) ?? toLocalDate(tenant.contractStart)
  const contractEnd = toLocalDate(tenant.contractEnd)
  const periodMonth = monthKey(year, monthIndex)

  if (contractStart && periodMonth < monthKey(contractStart.getFullYear(), contractStart.getMonth())) {
    return skippedRentSchedule(monthlyRent, regularDueDate, "BEFORE_CONTRACT_START")
  }

  if (contractEnd && periodMonth > monthKey(contractEnd.getFullYear(), contractEnd.getMonth())) {
    return skippedRentSchedule(monthlyRent, regularDueDate, "AFTER_CONTRACT_END")
  }

  // Арендные каникулы — первые N месяцев после contractStart не начисляются.
  // Считаем от contractStart, не от today: если арендатор заехал 1 января с
  // каникулами=3 — март включительно бесплатно, апрель — первый платный.
  const rentFreeMonths = Math.max(0, Math.trunc(tenant.rentFreeMonths ?? 0))
  if (rentFreeMonths > 0 && contractStart) {
    const startMonthKey = monthKey(contractStart.getFullYear(), contractStart.getMonth())
    const monthsSinceStart = periodMonth - startMonthKey
    if (monthsSinceStart >= 0 && monthsSinceStart < rentFreeMonths) {
      return skippedRentSchedule(monthlyRent, regularDueDate, "RENT_FREE_PERIOD")
    }
  }

  if (!contractStart || contractStart.getDate() === 1) {
    return fullRentSchedule(monthlyRent, regularDueDate)
  }

  const startMonth = monthKey(contractStart.getFullYear(), contractStart.getMonth())
  const startDay = normalizeThirtyDay(contractStart.getDate())

  if (periodMonth === startMonth) {
    const firstDueMonthIndex = startDay >= accountingDueDay ? contractStart.getMonth() + 1 : contractStart.getMonth()
    const firstDueDate = getDueDate(contractStart.getFullYear(), firstDueMonthIndex, paymentDueDay)
    const prorationDays = getThirtyDayProrationDays(startDay, accountingDueDay)
    const amount = roundMoney((monthlyRent / 30) * prorationDays)

    return {
      shouldCreate: true,
      amount,
      monthlyRent,
      dueDate: firstDueDate,
      isProrated: prorationDays !== 30,
      prorationDays,
      prorationStart: contractStart,
      prorationEnd: addDays(firstDueDate, -1),
    }
  }

  if (startDay >= accountingDueDay) {
    const firstDueDate = getDueDate(contractStart.getFullYear(), contractStart.getMonth() + 1, paymentDueDay)
    if (periodMonth === monthKey(firstDueDate.getFullYear(), firstDueDate.getMonth())) {
      return skippedRentSchedule(monthlyRent, regularDueDate, "FIRST_PERIOD_ALREADY_COVERED")
    }
  }

  return fullRentSchedule(monthlyRent, regularDueDate)
}

export function getTenantRentChargeDescription(
  placement: string,
  period: string,
  schedule: TenantRentChargeSchedule,
) {
  if (!schedule.isProrated || !schedule.prorationStart || !schedule.prorationDays) {
    return `Аренда ${placement} за ${period}`
  }

  return [
    `Аренда ${placement}: первый неполный период`,
    `с ${formatRentDate(schedule.prorationStart)} до ${formatRentDate(schedule.dueDate)}`,
    `(${schedule.prorationDays} дн., расчет /30)`,
  ].join(" ")
}

export function calculateTenantRatePerSqm(tenant: Pick<TenantRentInput, "customRate" | "space" | "tenantSpaces">) {
  const spaces = rentableSpaces(tenant)
  if (spaces.length === 0) return null
  return tenant.customRate ?? spaces[0].floor.ratePerSqm
}

function fullRentSchedule(monthlyRent: number, dueDate: Date): TenantRentChargeSchedule {
  return {
    shouldCreate: true,
    amount: monthlyRent,
    monthlyRent,
    dueDate,
    isProrated: false,
    prorationDays: null,
    prorationStart: null,
    prorationEnd: null,
  }
}

function skippedRentSchedule(
  monthlyRent: number,
  dueDate: Date,
  skippedReason: TenantRentChargeSchedule["skippedReason"],
): TenantRentChargeSchedule {
  return {
    shouldCreate: false,
    amount: 0,
    monthlyRent,
    dueDate,
    isProrated: false,
    prorationDays: null,
    prorationStart: null,
    prorationEnd: null,
    skippedReason,
  }
}

function parseRentPeriod(period: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period)
  if (!match) {
    throw new Error("Неверный формат периода (ожидается YYYY-MM)")
  }
  return {
    year: Number(match[1]),
    monthIndex: Number(match[2]) - 1,
  }
}

function normalizePaymentDueDay(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10
  return Math.min(Math.max(Math.trunc(value), 1), 31)
}

function normalizeThirtyDay(value: number) {
  return Math.min(Math.max(Math.trunc(value), 1), 30)
}

function getDueDate(year: number, monthIndex: number, paymentDueDay: number) {
  const normalized = new Date(year, monthIndex, 1)
  const lastDayOfMonth = new Date(normalized.getFullYear(), normalized.getMonth() + 1, 0).getDate()
  return new Date(
    normalized.getFullYear(),
    normalized.getMonth(),
    Math.min(paymentDueDay, lastDayOfMonth),
  )
}

function getThirtyDayProrationDays(startDay: number, paymentDueDay: number) {
  if (startDay === paymentDueDay) return 30
  if (startDay < paymentDueDay) return paymentDueDay - startDay
  return (30 - startDay) + paymentDueDay
}

function monthKey(year: number, monthIndex: number) {
  return year * 12 + monthIndex
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function toLocalDate(value: Date | string | null | undefined) {
  if (!value) return null
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    }
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatRentDate(date: Date) {
  return date.toLocaleDateString("ru-RU")
}

export function hasFixedTenantRent(value: number | null | undefined) {
  return positiveAmount(value) !== null
}

export function getTenantRentMode(tenant: Pick<TenantRentInput, "customRate" | "fixedMonthlyRent">): RentMode {
  if (positiveAmount(tenant.fixedMonthlyRent) !== null) return "FIXED"
  if (positiveAmount(tenant.customRate) !== null) return "RATE"
  return "FLOOR"
}

export function normalizeTenantRentChoice(input: {
  rentMode?: string | null
  customRate?: number | null
  fixedMonthlyRent?: number | null
  requireValueForMode?: boolean
}) {
  const customRate = positiveAmount(input.customRate)
  const fixedMonthlyRent = positiveAmount(input.fixedMonthlyRent)
  const rawRentMode = input.rentMode?.trim() || null

  if (customRate !== null && fixedMonthlyRent !== null) {
    throw new Error("Выберите только один способ аренды: ставка за м² или фиксированная сумма в месяц")
  }

  const rentMode = rawRentMode === "RATE" || rawRentMode === "FIXED" || rawRentMode === "FLOOR"
    ? rawRentMode
    : null

  if (rawRentMode !== null && rentMode === null) {
    throw new Error("Неверный способ расчета аренды")
  }

  if (rentMode === "FLOOR") {
    return { rentMode, customRate: null, fixedMonthlyRent: null }
  }

  if (rentMode === "RATE") {
    if (fixedMonthlyRent !== null) {
      throw new Error("Для режима ставки за м² очистите фиксированную аренду в месяц")
    }
    if (input.requireValueForMode && customRate === null) {
      throw new Error("Укажите индивидуальную ставку за м² или выберите другой способ аренды")
    }
    return { rentMode, customRate, fixedMonthlyRent: null }
  }

  if (rentMode === "FIXED") {
    if (customRate !== null) {
      throw new Error("Для режима фиксированной аренды очистите ставку за м²")
    }
    if (input.requireValueForMode && fixedMonthlyRent === null) {
      throw new Error("Укажите фиксированную сумму аренды в месяц или выберите другой способ аренды")
    }
    return { rentMode, customRate: null, fixedMonthlyRent }
  }

  if (fixedMonthlyRent !== null) return { rentMode: "FIXED" as const, customRate: null, fixedMonthlyRent }
  if (customRate !== null) return { rentMode: "RATE" as const, customRate, fixedMonthlyRent: null }
  return { rentMode: "FLOOR" as const, customRate: null, fixedMonthlyRent: null }
}
