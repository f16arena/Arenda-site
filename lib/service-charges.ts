export const SERVICE_CHARGE_TYPES = [
  { type: "ELECTRICITY", label: "Свет", description: "Электроэнергия" },
  { type: "WATER", label: "Вода", description: "Водоснабжение" },
  { type: "GARBAGE", label: "Вывоз мусора", description: "Вывоз мусора" },
  { type: "HEATING", label: "Отопление", description: "Отопление" },
  { type: "SECURITY", label: "Охрана", description: "Охрана" },
  { type: "INTERNET", label: "Интернет", description: "Интернет" },
  { type: "OTHER", label: "Прочее", description: "Дополнительная услуга" },
] as const

export type ServiceChargeType = (typeof SERVICE_CHARGE_TYPES)[number]["type"]

export const SERVICE_CHARGE_TYPE_VALUES = SERVICE_CHARGE_TYPES.map((item) => item.type)

export function isServiceChargeType(value: string): value is ServiceChargeType {
  return SERVICE_CHARGE_TYPE_VALUES.includes(value as ServiceChargeType)
}

export function getServiceChargeDescription(type: ServiceChargeType) {
  return SERVICE_CHARGE_TYPES.find((item) => item.type === type)?.description ?? type
}

/**
 * Парсит `building.utilitiesInServiceFee` (JSON-строка с массивом типов
 * или null) в Set валидных ServiceChargeType. Невалидные/неизвестные
 * значения молча отбрасываются.
 */
export function parseUtilitiesInServiceFee(value: string | null | undefined): Set<ServiceChargeType> {
  if (!value) return new Set()
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed
        .filter((v): v is string => typeof v === "string")
        .filter((v): v is ServiceChargeType => isServiceChargeType(v)),
    )
  } catch {
    return new Set()
  }
}

/** Сериализация обратно в JSON-строку для сохранения в БД. */
export function serializeUtilitiesInServiceFee(values: Iterable<string>): string | null {
  const arr = Array.from(values).filter((v): v is ServiceChargeType => isServiceChargeType(v))
  if (arr.length === 0) return null
  return JSON.stringify(arr)
}
