export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getCurrentBuildingId } from "@/lib/current-building"
import { LeadKanbanLoader } from "./lead-kanban-loader"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { safeServerValue } from "@/lib/server-fallback"

export default async function LeadsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/leads", orgId, userId: session.user.id })

  const buildingId = await getCurrentBuildingId()
  if (!buildingId) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
        <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Сначала выберите здание</p>
      </div>
    )
  }
  await assertBuildingInOrg(buildingId, orgId)

  const leads = await safe(
    "admin.leads.items",
    db.lead.findMany({
      where: { buildingId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, contact: true, contactType: true,
        companyName: true, legalType: true, desiredArea: true, budget: true,
        source: true, status: true, notes: true, bookedUntil: true,
        spaceId: true, createdAt: true,
      },
    }),
    [],
  )

  const vacantSpaces = await safe(
    "admin.leads.vacantSpaces",
    db.space.findMany({
      where: { status: { in: ["VACANT", "MAINTENANCE"] }, kind: "RENTABLE", floor: { buildingId } },
      select: {
        id: true, number: true, area: true, status: true,
        floor: { select: { name: true } },
      },
      orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
    }),
    [],
  )

  return <LeadKanbanLoader leads={leads} vacantSpaces={vacantSpaces} />
}
