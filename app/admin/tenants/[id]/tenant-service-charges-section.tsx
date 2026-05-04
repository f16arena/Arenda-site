import { db } from "@/lib/db"
import { SERVICE_CHARGE_TYPE_VALUES } from "@/lib/service-charges"
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
  const existingCharges = await db.charge.findMany({
    where: {
      tenantId,
      period,
      type: { in: [...SERVICE_CHARGE_TYPE_VALUES] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, amount: true, description: true },
  })

  return (
    <ServiceChargesFormLoader
      tenantId={tenantId}
      period={period}
      defaultDueDate={defaultDueDate}
      existingCharges={existingCharges}
    />
  )
}
