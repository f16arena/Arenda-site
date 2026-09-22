export const dynamic = "force-dynamic"

import { tenantInBuildingsWhere } from "@/lib/tenant-scope"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { db } from "@/lib/db"
import { ImportPage } from "@/components/import/import-page"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { ImportClient } from "./import-client"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { getT } from "@/lib/i18n/server"

export default async function BankImportPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const { orgId } = await requireOrgAccess()
  const { t } = await getT()
  const caps = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: !!session.user.isPlatformOwner,
    orgId,
  }))
  const canApply = caps.has("finance.importBank")

  // Только арендаторы СВОЕЙ организации (и выбранного здания). Раньше без
  // выбранного здания where был пустой — в список попадали арендаторы всех
  // организаций платформы с БИН/ИИН.
  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const buildingIds = buildingId ? [buildingId] : await getAccessibleBuildingIdsForSession(orgId)
  const tenants = await db.tenant.findMany({
    where: tenantInBuildingsWhere(orgId, buildingIds),
    select: { id: true, companyName: true, bin: true, iin: true },
    orderBy: { companyName: "asc" },
  })

  return (
    <ImportPage
      title={t("adminFinance.import.title")}
      subtitle={t("adminFinance.import.subtitle")}
      columns={
        <>
          <p>{t("adminFinance.import.columnsLine1")}</p>
          <p>{t("adminFinance.import.columnsLine2")}</p>
        </>
      }
    >
      <ImportClient tenants={tenants} canApply={canApply} />
    </ImportPage>
  )
}
