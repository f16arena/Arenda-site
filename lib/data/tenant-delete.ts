import "server-only"
import { db } from "@/lib/db"

/**
 * Мягкое удаление арендатора — ОДИН путь для «Удалить арендатора» и «Удалить
 * пользователя». Раньше удаление через пользователя помечало только самого
 * арендатора: его начисления, оплаты, договоры и привязки к помещениям
 * оставались живыми и попадали в долги, доход и отчёты.
 *
 * purgeTechnical — жёстко удалить технические связи без deletedAt (заявки с
 * комментариями, документы помещений). Удаление пользователя их не трогает.
 */
export async function softDeleteTenantRecords(
  tenantId: string,
  opts: { purgeTechnical?: boolean } = {},
): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, userId: true, spaceId: true, tenantSpaces: { select: { spaceId: true } } },
  })
  if (!tenant) return
  const spaceIdsToVacate = [...new Set([
    tenant.spaceId,
    ...tenant.tenantSpaces.map((item) => item.spaceId),
  ].filter(Boolean) as string[])]
  const now = new Date()

  await db.$transaction([
    ...(spaceIdsToVacate.length > 0
      ? [db.space.updateMany({ where: { id: { in: spaceIdsToVacate } }, data: { status: "VACANT" } })]
      : []),
    db.tenantSpace.deleteMany({ where: { tenantId } }),
    db.floor.updateMany({
      where: { fullFloorTenantId: tenantId },
      data: { fullFloorTenantId: null, fixedMonthlyRent: null },
    }),
    ...(opts.purgeTechnical
      ? [
          db.tenantDocument.deleteMany({ where: { tenantId } }),
          db.requestComment.deleteMany({ where: { request: { tenantId } } }),
          db.request.deleteMany({ where: { tenantId } }),
        ]
      : []),
    db.contract.updateMany({ where: { tenantId, deletedAt: null }, data: { deletedAt: now } }),
    // Документы и файлы арендатора тоже уходят из списков: раньше они
    // оставались «живыми» в «Документах» и «Хранилище» после удаления.
    db.generatedDocument.updateMany({ where: { tenantId, deletedAt: null }, data: { deletedAt: now } }),
    db.storedFile.updateMany({ where: { tenantId, deletedAt: null }, data: { deletedAt: now } }),
    // Рассрочка перестаёт учитываться крон-задачей по пеням.
    db.debtInstallmentPlan.updateMany({ where: { tenantId, status: "ACTIVE" }, data: { status: "CANCELLED" } }),
    db.payment.updateMany({ where: { tenantId, deletedAt: null }, data: { deletedAt: now } }),
    db.charge.updateMany({ where: { tenantId, deletedAt: null }, data: { deletedAt: now } }),
    db.tenant.update({ where: { id: tenantId }, data: { deletedAt: now, spaceId: null } }),
    // Пользователь: и выключен, и скрыт из /admin/users (там фильтр по deletedAt).
    db.user.update({ where: { id: tenant.userId }, data: { isActive: false, deletedAt: now } }),
  ])
}
