"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg } from "@/lib/scope-guards"

export async function saveFloorLayout(floorId: string, layoutJson: string) {
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

  await db.floor.update({
    where: { id: floorId },
    data: { layoutJson },
  })

  revalidatePath("/admin/spaces")
  revalidatePath(`/admin/floors/${floorId}`)
  return { success: true }
}
