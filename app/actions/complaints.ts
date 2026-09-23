"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { complaintScope } from "@/lib/tenant-scope"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { getT } from "@/lib/i18n/server"

// Переводчик приходит параметром: чистый помощник сам его не добывает.
type Tr = Awaited<ReturnType<typeof getT>>["t"]

async function assertComplaintInOrg(id: string, orgId: string, t: Tr) {
  const found = await db.complaint.findFirst({
    where: { id, ...complaintScope(orgId) },
    select: { id: true },
  })
  if (!found) throw new Error(t("actions.complaints.notFoundOrNoAccess"))
}

export async function respondToComplaint(id: string, formData: FormData) {
  const { t } = await getT()
  await requireCapabilityAndFeature("complaints.manage")
  const { orgId } = await requireOrgAccess()
  await assertComplaintInOrg(id, orgId, t)

  const response = formData.get("response") as string
  await db.complaint.update({
    where: { id },
    data: { response, status: "REVIEWED" },
  })
  revalidatePath("/admin/complaints")
  return { success: true }
}

export async function resolveComplaint(id: string) {
  const { t } = await getT()
  await requireCapabilityAndFeature("complaints.manage")
  const { orgId } = await requireOrgAccess()
  await assertComplaintInOrg(id, orgId, t)

  await db.complaint.update({
    where: { id },
    data: { status: "RESOLVED" },
  })
  revalidatePath("/admin/complaints")
  return { success: true }
}
