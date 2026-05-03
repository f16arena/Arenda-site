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
