export const MOBILE_NOTIFICATION_TYPES = [
  { key: "BUILDING_NOTICE", label: "Объявления по зданию" },
  { key: "DOCUMENT_SIGNATURE_REQUEST", label: "Документы на подпись" },
  { key: "PAYMENT_CONFIRMED", label: "Оплаты подтверждены" },
  { key: "PAYMENT_DISPUTED", label: "Оплаты требуют уточнения" },
  { key: "PAYMENT_REJECTED", label: "Оплаты отклонены" },
  { key: "PAYMENT_REPORTED", label: "Новые отчеты об оплате" },
  { key: "NEW_REQUEST", label: "Новые заявки" },
  { key: "REQUEST_STATUS_CHANGED", label: "Статусы заявок" },
  { key: "MESSAGE", label: "Сообщения" },
  { key: "MESSAGE_RECEIVED", label: "Входящие сообщения" },
  { key: "CONTRACT_EXPIRING", label: "Сроки договоров" },
  { key: "PAYMENT_DUE", label: "Напоминания об оплате" },
  // Бытовые типы — добавлены для возможности отключения (см. AUDIT_2026-05-26.md #21).
  // SUBSCRIPTION_*, SERVICE_FEE_INDEXED сознательно НЕ добавляем — это юр. критичные
  // уведомления, отключение которых нарушит обязательства информирования клиента.
  { key: "ADDON_REQUEST", label: "Заявки на аддоны (только супер-админ)" },
  { key: "ADDON_ACTIVATED", label: "Аддон активирован" },
  { key: "ADDON_REJECTED", label: "Заявка на аддон отклонена" },
  { key: "ADDON_DEACTIVATED", label: "Аддон выключен" },
  { key: "SERVICE_REQUEST", label: "Заявки на разовые услуги (только супер-админ)" },
  { key: "SERVICE_PAID", label: "Услуга оплачена" },
  { key: "SERVICE_DELIVERED", label: "Услуга выполнена" },
  { key: "SERVICE_CANCELLED", label: "Услуга отменена" },
] as const

const KNOWN_TYPES: ReadonlySet<string> = new Set(MOBILE_NOTIFICATION_TYPES.map((item) => item.key))

export function normalizeMutedTypes(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toUpperCase())
      .filter((item) => KNOWN_TYPES.has(item))
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => enabled === false)
      .map(([key]) => key.trim().toUpperCase())
      .filter((key) => KNOWN_TYPES.has(key))
  }

  return []
}

export function isNotificationTypeMuted(value: unknown, type: string) {
  return normalizeMutedTypes(value).includes(type.trim().toUpperCase())
}
