"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOwner } from "@/lib/permissions"
import { invalidateAclCache } from "@/lib/acl"

export async function setPermission(role: string, section: string, canView: boolean, canEdit: boolean) {
  await requireOwner()

  // canEdit без canView — нелогично, выключаем
  if (canEdit && !canView) canEdit = false

  await db.rolePermission.upsert({
    where: { role_section: { role, section } },
    update: { canView, canEdit },
    create: { role, section, canView, canEdit },
  })

  invalidateAclCache()
  revalidatePath("/admin/roles", "layout")
}
