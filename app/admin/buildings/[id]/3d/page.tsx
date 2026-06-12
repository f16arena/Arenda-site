export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { ArrowLeft, Box } from "lucide-react"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { buildingScope } from "@/lib/tenant-scope"
import { Building3DLoader } from "@/components/building/building-3d-loader"

/**
 * 3D-вид здания целиком: этажи стопкой, срезы по этажам, территория с
 * парковкой. Данные подтягиваются клиентом из /api/admin/buildings/[id]/3d.
 */
export default async function Building3DPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const { id } = await params

  const building = await db.building.findFirst({
    where: { AND: [buildingScope(orgId), { id }] },
    select: { id: true, name: true, address: true },
  })
  if (!building) notFound()

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/buildings"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Здания
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-500/10">
            <Box className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{building.name} — 3D</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{building.address}</p>
          </div>
        </div>
        <Link
          href="/admin/builder"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:opacity-90"
        >
          <Box className="h-4 w-4" /> Building Studio (β)
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <Building3DLoader buildingId={building.id} />
      </div>
    </div>
  )
}
