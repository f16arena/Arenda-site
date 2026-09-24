// Виды уведомлений, которые арендатор и администратор могут отключить.
//
// Здесь только коды: они лежат в User.mutedNotificationTypes и в проверках
// lib/notify.ts. Подписи — в словаре, catalogs.notificationTypes.<код>: список
// уходит в мобильное приложение готовыми строками, поэтому переводится на
// сервере по языку получателя (app/api/mobile/notification-settings).
export const MOBILE_NOTIFICATION_TYPES = [
  "BUILDING_NOTICE",
  "DOCUMENT_SIGNATURE_REQUEST",
  "PAYMENT_CONFIRMED",
  "PAYMENT_DISPUTED",
  "PAYMENT_REJECTED",
  "PAYMENT_REPORTED",
  "NEW_REQUEST",
  "REQUEST_STATUS_CHANGED",
  "MESSAGE",
  "MESSAGE_RECEIVED",
  "CONTRACT_EXPIRING",
  "PAYMENT_DUE",
  // Бытовые типы — добавлены для возможности отключения (см. AUDIT_2026-05-26.md #21).
  // SUBSCRIPTION_*, SERVICE_FEE_INDEXED сознательно НЕ добавляем — это юр. критичные
  // уведомления, отключение которых нарушит обязательства информирования клиента.
  "ADDON_REQUEST",
  "ADDON_ACTIVATED",
  "ADDON_REJECTED",
  "ADDON_DEACTIVATED",
  "SERVICE_REQUEST",
  "SERVICE_PAID",
  "SERVICE_DELIVERED",
  "SERVICE_CANCELLED",
] as const

export type MobileNotificationType = (typeof MOBILE_NOTIFICATION_TYPES)[number]

/** Ключ подписи вида уведомления в словаре. */
export function notificationTypeNameKey(type: MobileNotificationType) {
  return `catalogs.notificationTypes.${type}` as const
}

const KNOWN_TYPES: ReadonlySet<string> = new Set(MOBILE_NOTIFICATION_TYPES)

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
