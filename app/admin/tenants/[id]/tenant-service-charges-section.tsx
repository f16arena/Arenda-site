import { db } from "@/lib/db"
import { SERVICE_CHARGE_TYPE_VALUES, parseUtilitiesInServiceFee } from "@/lib/service-charges"
import { getTenantPrimaryBuildingId } from "@/lib/tenant-placement"
import { ServiceChargesFormLoader } from "./client-section-loaders"

export async function TenantServiceChargesSection({
  tenantId,
  period,
  defaultDueDate,
}: {
  tenantId: string
  period: string
  defaultDueDate: string
}) {
  const [existingCharges, tenant] = await Promise.all([
    db.charge.findMany({
      where: {
        tenantId,
        period,
        type: { in: [...SERVICE_CHARGE_TYPE_VALUES] },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, amount: true, description: true },
    }),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        space: { select: { floor: { select: { buildingId: true } } } },
        tenantSpaces: { select: { space: { select: { floor: { select: { buildingId: true } } } } } },
        fullFloors: { select: { buildingId: true } },
      },
    }),
  ])

  // Подтягиваем настройки эксп. сбора здания арендатора (utilitiesInServiceFee).
  // Если у тенанта нет здания (висячий тенант) — пустой массив.
  const buildingId = tenant ? getTenantPrimaryBuildingId(tenant) : null
  const building = buildingId
    ? await db.building.findUnique({
        where: { id: buildingId },
        select: { utilitiesInServiceFee: true },
      })
    : null
  const utilitiesInServiceFee = Array.from(parseUtilitiesInServiceFee(building?.utilitiesInServiceFee))

  return (
    <ServiceChargesFormLoader
      tenantId={tenantId}
      period={period}
      defaultDueDate={defaultDueDate}
      existingCharges={existingCharges}
      utilitiesInServiceFee={utilitiesInServiceFee}
    />
  )
}
