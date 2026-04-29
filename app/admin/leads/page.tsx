export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getCurrentBuildingId } from "@/lib/current-building"
import { LeadKanban } from "./lead-kanban"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"

export default async function LeadsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const buildingId = await getCurrentBuildingId()
  if (!buildingId) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <p className="text-slate-500">Сначала выберите здание</p>
      </div>
    )
  }
  await assertBuildingInOrg(buildingId, orgId)

  const leads = await db.lead.findMany({
    where: { buildingId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, contact: true, contactType: true,
      companyName: true, legalType: true, desiredArea: true, budget: true,
      source: true, status: true, notes: true, bookedUntil: true,
      spaceId: true, createdAt: true,
    },
  }).catch(() => [])

  const vacantSpaces = await db.space.findMany({
    where: { status: { in: ["VACANT", "MAINTENANCE"] }, floor: { buildingId } },
    select: {
      id: true, number: true, area: true, status: true,
      floor: { select: { name: true } },
    },
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  }).catch(() => [])

  return <LeadKanban leads={leads} vacantSpaces={vacantSpaces} />
}
