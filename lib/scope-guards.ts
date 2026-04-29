import { db } from "./db"
import {
  tenantScope, spaceScope, floorScope, buildingScope,
  chargeScope, paymentScope, contractScope, requestScope,
  taskScope, leadScope, expenseScope, meterScope,
  staffScope, tenantDocumentScope,
} from "./tenant-scope"

/**
 * Проверки принадлежности отдельных записей к текущей организации.
 * Если запись не принадлежит — кидаем ScopeError (403).
 *
 * Используются в server actions, когда ID приходит от клиента (form data, query)
 * и нельзя доверять, что это ID из «своей» организации.
 */
export class ScopeError extends Error {
  constructor(entity: string) {
    super(`Доступ запрещён: ${entity} не принадлежит вашей организации`)
    this.name = "ScopeError"
  }
}

async function assertExists<T>(promise: Promise<T | null>, entity: string): Promise<T> {
  const result = await promise
  if (!result) throw new ScopeError(entity)
  return result
}

export async function assertTenantInOrg(tenantId: string, orgId: string): Promise<void> {
  await assertExists(
    db.tenant.findFirst({
      where: { id: tenantId, ...tenantScope(orgId) },
      select: { id: true },
    }),
    `арендатор #${tenantId}`,
  )
}

export async function assertBuildingInOrg(buildingId: string, orgId: string): Promise<void> {
  await assertExists(
    db.building.findFirst({
      where: { id: buildingId, ...buildingScope(orgId) },
      select: { id: true },
    }),
    `здание #${buildingId}`,
  )
}

export async function assertFloorInOrg(floorId: string, orgId: string): Promise<void> {
  await assertExists(
    db.floor.findFirst({
      where: { id: floorId, ...floorScope(orgId) },
      select: { id: true },
    }),
    `этаж #${floorId}`,
  )
}

export async function assertSpaceInOrg(spaceId: string, orgId: string): Promise<void> {
  await assertExists(
    db.space.findFirst({
      where: { id: spaceId, ...spaceScope(orgId) },
      select: { id: true },
    }),
    `помещение #${spaceId}`,
  )
}

export async function assertChargeInOrg(chargeId: string, orgId: string): Promise<void> {
  await assertExists(
    db.charge.findFirst({
      where: { id: chargeId, ...chargeScope(orgId) },
      select: { id: true },
    }),
    `начисление #${chargeId}`,
  )
}

export async function assertPaymentInOrg(paymentId: string, orgId: string): Promise<void> {
  await assertExists(
    db.payment.findFirst({
      where: { id: paymentId, ...paymentScope(orgId) },
      select: { id: true },
    }),
    `платёж #${paymentId}`,
  )
}

export async function assertContractInOrg(contractId: string, orgId: string): Promise<void> {
  await assertExists(
    db.contract.findFirst({
      where: { id: contractId, ...contractScope(orgId) },
      select: { id: true },
    }),
    `договор #${contractId}`,
  )
}

export async function assertRequestInOrg(requestId: string, orgId: string): Promise<void> {
  await assertExists(
    db.request.findFirst({
      where: { id: requestId, ...requestScope(orgId) },
      select: { id: true },
    }),
    `заявка #${requestId}`,
  )
}

export async function assertTaskInOrg(taskId: string, orgId: string): Promise<void> {
  await assertExists(
    db.task.findFirst({
      where: { id: taskId, ...taskScope(orgId) },
      select: { id: true },
    }),
    `задача #${taskId}`,
  )
}

export async function assertLeadInOrg(leadId: string, orgId: string): Promise<void> {
  await assertExists(
    db.lead.findFirst({
      where: { id: leadId, ...leadScope(orgId) },
      select: { id: true },
    }),
    `лид #${leadId}`,
  )
}

export async function assertExpenseInOrg(expenseId: string, orgId: string): Promise<void> {
  await assertExists(
    db.expense.findFirst({
      where: { id: expenseId, ...expenseScope(orgId) },
      select: { id: true },
    }),
    `расход #${expenseId}`,
  )
}

export async function assertMeterInOrg(meterId: string, orgId: string): Promise<void> {
  await assertExists(
    db.meter.findFirst({
      where: { id: meterId, ...meterScope(orgId) },
      select: { id: true },
    }),
    `счётчик #${meterId}`,
  )
}

export async function assertStaffInOrg(staffId: string, orgId: string): Promise<void> {
  await assertExists(
    db.staff.findFirst({
      where: { id: staffId, ...staffScope(orgId) },
      select: { id: true },
    }),
    `сотрудник #${staffId}`,
  )
}

export async function assertTenantDocumentInOrg(docId: string, orgId: string): Promise<void> {
  await assertExists(
    db.tenantDocument.findFirst({
      where: { id: docId, ...tenantDocumentScope(orgId) },
      select: { id: true },
    }),
    `документ #${docId}`,
  )
}

/**
 * Проверяет, что пользователь (по userId) принадлежит этой же организации.
 * Используется при операциях с другими пользователями (staff, tenants users).
 */
export async function assertUserInOrg(userId: string, orgId: string): Promise<void> {
  await assertExists(
    db.user.findFirst({
      where: { id: userId, organizationId: orgId },
      select: { id: true },
    }),
    `пользователь #${userId}`,
  )
}
