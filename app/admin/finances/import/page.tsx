export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { ImportClient } from "./import-client"
import { getCurrentBuildingId } from "@/lib/current-building"

export default async function ImportPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

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
        <h1 className="text-2xl font-semibold text-slate-900">Импорт банковской выписки</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Загрузите CSV из Kaspi Business / Halyk Online — система автоматически сопоставит платежи с арендаторами по БИН/ИИН в назначении платежа
        </p>
      </div>

      <ImportClient tenants={tenants} />
    </div>
  )
}
