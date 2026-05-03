import { db } from "./db"

/**
 * Org-scoped where-фабрики для Prisma.
 *
 * Каждая фабрика возвращает фрагмент `where`, который ограничивает выборку
 * записями текущей организации. Использовать как:
 *
 *   await db.tenant.findMany({ where: tenantScope(orgId) })
 *   await db.charge.findMany({ where: { ...chargeScope(orgId), period: "2026-04" } })
 *
 * Если `orgId` пустой — все фабрики возвращают `where: { id: "__never__" }`,
 * чтобы вернуть пустой результат вместо случайной утечки.
 */

const NEVER = { id: "__never__" } as const

// Прямые ссылки на organizationId
export function buildingScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { organizationId: orgId }
}

export function userScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { organizationId: orgId }
}

// Floor → building.organization
export function floorScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { building: { organizationId: orgId } }
}

// Space → floor → building.organization
export function spaceScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { floor: { building: { organizationId: orgId } } }
}

// Tenant может быть привязан тремя путями:
//   1. К Space (обычное помещение)
//   2. К Floor целиком (через fullFloors)
//   3. Без привязки — только через user.organizationId (свежесозданный арендатор)
// Изоляция: любой из путей должен вести в нашу организацию.
export function tenantScope(orgId: string | null) {
  if (!orgId) return NEVER
  return {
    OR: [
      { space: { floor: { building: { organizationId: orgId } } } },
      { fullFloors: { some: { building: { organizationId: orgId } } } },
      { user: { organizationId: orgId } },
    ],
  }
}

// Charge → tenant → ... → org
export function chargeScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { tenant: tenantScope(orgId) }
}

// Payment → tenant → ... → org
export function paymentScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { tenant: tenantScope(orgId) }
}

// Contract → tenant → ... → org
export function contractScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { tenant: tenantScope(orgId) }
}

// TenantDocument → tenant
export function tenantDocumentScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { tenant: tenantScope(orgId) }
}

// Request → tenant
export function requestScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { tenant: tenantScope(orgId) }
}

// Task — buildingId опционален; задачи без здания принадлежат организации создателя.
export function taskScope(orgId: string | null) {
  if (!orgId) return NEVER
  return {
    OR: [
      { building: { organizationId: orgId } },
      // Задачи без здания — фильтруем по создателю в той же организации
      { buildingId: null, createdBy: { organizationId: orgId } },
    ],
  }
}

// Lead → building.org
export function leadScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { building: { organizationId: orgId } }
}

// Expense → building.org
export function expenseScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { building: { organizationId: orgId } }
}

// EmergencyContact → building.org
export function emergencyContactScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { building: { organizationId: orgId } }
}

// Tariff → building.org
export function tariffScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { building: { organizationId: orgId } }
}

// Meter → space → floor → building
export function meterScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { space: { floor: { building: { organizationId: orgId } } } }
}

// MeterReading → meter → ...
export function meterReadingScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { meter: { space: { floor: { building: { organizationId: orgId } } } } }
}

// Staff → user → org
export function staffScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { user: { organizationId: orgId } }
}

// SalaryPayment → staff → user → org
export function salaryPaymentScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { staff: { user: { organizationId: orgId } } }
}

// Notification → user
export function notificationScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { user: { organizationId: orgId } }
}

// Message — корпоративные сообщения внутри организации.
// От отправителя или получателя из этой организации.
export function messageScope(orgId: string | null) {
  if (!orgId) return NEVER
  return {
    OR: [
      { from: { organizationId: orgId } },
      { to: { organizationId: orgId } },
    ],
  }
}

// Complaint — жалобы могут быть анонимными. Мы фильтруем по userId если задан,
// иначе complaint остаётся видимым только в org его получателя — для этого
// нужен явный buildingId/orgId в Complaint, что выходит за рамки текущей схемы.
// Пока используем строгую фильтрацию: только жалобы от своих пользователей.
export function complaintScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { user: { organizationId: orgId } }
}

// RequestComment → request → tenant → org
export function requestCommentScope(orgId: string | null) {
  if (!orgId) return NEVER
  return { request: { tenant: tenantScope(orgId) } }
}

// AuditLog — должен быть scoped по userId, но AuditLog хранит userId напрямую.
// Если потребуется — добавим в AuditLog поле organizationId.
export async function auditLogScope(orgId: string | null) {
  if (!orgId) return NEVER
  // Через user — медленно, но безопасно. Лучше — добавить organizationId в AuditLog.
  const userIds = (await db.user.findMany({
    where: userScope(orgId),
    select: { id: true },
  })).map((u) => u.id)
  if (userIds.length === 0) return NEVER
  return { userId: { in: userIds } }
}

// EmailLog
export async function emailLogScope(orgId: string | null) {
  if (!orgId) return NEVER
  const [tenantIds, userIds] = await Promise.all([
    db.tenant.findMany({ where: tenantScope(orgId), select: { id: true } }),
    db.user.findMany({ where: userScope(orgId), select: { id: true } }),
  ])

  const tenantIdList = tenantIds.map((t) => t.id)
  const userIdList = userIds.map((u) => u.id)
  if (tenantIdList.length === 0 && userIdList.length === 0) return NEVER

  return {
    OR: [
      ...(tenantIdList.length > 0 ? [{ tenantId: { in: tenantIdList } }] : []),
      ...(userIdList.length > 0 ? [{ userId: { in: userIdList } }] : []),
    ],
  }
}
