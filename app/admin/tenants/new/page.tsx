export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { spaceScope } from "@/lib/tenant-scope"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { getT } from "@/lib/i18n/server"
import { TenantWizard } from "./tenant-wizard"

/**
 * Мастер заселения: контакты и компания → помещение и условия → договор.
 * Один поток вместо четырёх форм, данные вводятся один раз (аудит 2026-06-10, п.11).
 */
export default async function NewTenantWizardPage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const { t } = await getT()
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const { space: presetSpaceId } = await searchParams
  const visibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)

  const vacantSpaces = await db.space.findMany({
    where: {
      AND: [
        spaceScope(orgId),
        { status: "VACANT", kind: "RENTABLE" },
        { tenantSpaces: { none: {} } },
        { tenant: null },
        { floor: { buildingId: { in: visibleBuildingIds } } },
      ],
    },
    select: {
      id: true,
      number: true,
      area: true,
      floor: { select: { name: true, ratePerSqm: true, building: { select: { id: true, name: true } } } },
    },
    orderBy: [{ floor: { building: { name: "asc" } } }, { floor: { number: "asc" } }, { number: "asc" }],
    take: 140,
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs
        items={[
          { label: t("adminTenants.wizard.home"), href: "/admin" },
          { label: t("adminTenants.wizard.tenants"), href: "/admin/tenants" },
          { label: t("adminTenants.wizard.breadcrumb") },
        ]}
      />
      <TenantWizard
        initialSpaceId={presetSpaceId && vacantSpaces.some((s) => s.id === presetSpaceId) ? presetSpaceId : undefined}
        vacantSpaces={vacantSpaces.map((s) => ({
          id: s.id,
          number: s.number,
          area: s.area,
          floorName: s.floor.name,
          ratePerSqm: s.floor.ratePerSqm,
          buildingId: s.floor.building.id,
          buildingName: s.floor.building.name,
        }))}
      />
    </div>
  )
}
