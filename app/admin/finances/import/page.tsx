export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { ImportClient } from "./import-client"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"

export default async function ImportPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const { orgId } = await requireOrgAccess()
  const caps = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: !!session.user.isPlatformOwner,
    orgId,
  }))
  const canApply = caps.has("finance.importBank")

  const buildingId = await getCurrentBuildingId()
  const floorIds = buildingId
    ? (await db.floor.findMany({ where: { buildingId }, select: { id: true } })).map((f) => f.id)
    : []
  const tenants = await db.tenant.findMany({
    where: floorIds.length > 0 ? { OR: [
      { space: { floorId: { in: floorIds } } },
      { spaceId: null },
    ] } : undefined,
    select: { id: true, companyName: true, bin: true, iin: true },
    orderBy: { companyName: "asc" },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Импорт банковской выписки</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Загрузите CSV из Kaspi Business / Halyk Online — система автоматически сопоставит платежи с арендаторами по БИН/ИИН в назначении платежа
        </p>
      </div>

      <ImportClient tenants={tenants} canApply={canApply} />
    </div>
  )
}
