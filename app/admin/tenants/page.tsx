export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { TenantDialog } from "./tenant-dialog"
import { TenantsTable, type TenantRow } from "./tenants-table"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope, spaceScope } from "@/lib/tenant-scope"

export default async function TenantsPage() {
  const { orgId } = await requireOrgAccess()

  // Все арендаторы текущей организации — включая ещё не назначенных на помещение,
  // но привязанных через user.organizationId (если spaceId = null).
  const tenants = await db.tenant.findMany({
    where: {
      OR: [
        tenantScope(orgId),
        { spaceId: null, user: { organizationId: orgId } },
      ],
    },
    select: {
      id: true,
      companyName: true,
      legalType: true,
      bin: true,
      category: true,
      createdAt: true,
      user: { select: { id: true, name: true, phone: true, email: true } },
      space: {
        select: {
          number: true,
          area: true,
          floor: { select: { name: true, ratePerSqm: true } },
        },
      },
      // Этажи, где этот арендатор сдан целиком — обратное отношение через Floor.fullFloorTenantId
      fullFloors: {
        select: {
          id: true,
          name: true,
          totalArea: true,
          fixedMonthlyRent: true,
        },
      },
      charges: { where: { isPaid: false }, select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const vacantSpaces = await db.space.findMany({
    where: {
      AND: [spaceScope(orgId), { status: "VACANT", kind: "RENTABLE" }],
    },
    select: {
      id: true,
      number: true,
      area: true,
      floor: { select: { name: true } },
    },
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  })

  const rows: TenantRow[] = tenants.map((t) => ({
    id: t.id,
    companyName: t.companyName,
    legalType: t.legalType,
    bin: t.bin,
    category: t.category,
    user: { name: t.user.name, phone: t.user.phone, email: t.user.email },
    space: t.space,
    fullFloors: t.fullFloors.map((f) => ({
      id: f.id,
      name: f.name,
      totalArea: f.totalArea,
      fixedMonthlyRent: f.fixedMonthlyRent,
    })),
    debt: t.charges.reduce((s, c) => s + c.amount, 0),
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Арендаторы</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {tenants.length} зарегистрировано
          </p>
        </div>
        <TenantDialog vacantSpaces={vacantSpaces.map((s) => ({
          id: s.id,
          number: s.number,
          floorName: s.floor.name,
          area: s.area,
        }))} />
      </div>

      <TenantsTable tenants={rows} />
    </div>
  )
}
