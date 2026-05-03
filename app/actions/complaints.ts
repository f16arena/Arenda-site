"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { complaintScope } from "@/lib/tenant-scope"
import { requireSection } from "@/lib/acl"

async function assertComplaintInOrg(id: string, orgId: string) {
  const found = await db.complaint.findFirst({
    where: { id, ...complaintScope(orgId) },
    select: { id: true },
  })
  if (!found) throw new Error("Жалоба не найдена или нет доступа")
}

export async function respondToComplaint(id: string, formData: FormData) {
  await requireSection("complaints", "edit")
  const { orgId } = await requireOrgAccess()
  await assertComplaintInOrg(id, orgId)

  const response = formData.get("response") as string
  await db.complaint.update({
    where: { id },
    data: { response, status: "REVIEWED" },
  })
  revalidatePath("/admin/complaints")
  return { success: true }
}

export async function resolveComplaint(id: string) {
  await requireSection("complaints", "edit")
  const { orgId } = await requireOrgAccess()
  await assertComplaintInOrg(id, orgId)

  await db.complaint.update({
    where: { id },
    data: { status: "RESOLVED" },
  })
  revalidatePath("/admin/complaints")
  return { success: true }
}
