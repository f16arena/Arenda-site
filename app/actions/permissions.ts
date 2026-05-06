"use server"

import { db } from "@/lib/db"
import { revalidatePath, revalidateTag } from "next/cache"
import { requireOwner } from "@/lib/permissions"
import { invalidateAclCache } from "@/lib/acl"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"
import { audit } from "@/lib/audit"
import { requireOrgAccess } from "@/lib/org"
import {
  canManageRoleInOrg,
  isOwnerRole,
  isSystemRole,
  makeOrgRoleCode,
} from "@/lib/role-capabilities"

export async function setPermission(role: string, section: string, canView: boolean, canEdit: boolean) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()

  if (!canManageRoleInOrg(role, orgId)) {
    throw new Error("Эту должность нельзя менять в текущей организации")
  }

  if (isOwnerRole(role)) {
    throw new Error("Владелец всегда имеет полный доступ")
  }

  if (canEdit && !canView) canEdit = false

  await db.rolePermission.upsert({
    where: { role_section: { role, section } },
    update: { canView, canEdit },
    create: { role, section, canView, canEdit },
  })

  await audit({
    action: "UPDATE",
    entity: "user",
    entityId: role,
    details: { scope: "role_permission", section, canView, canEdit, orgId },
  })

  invalidateAclCache()
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/roles", "layout")
}

export async function createRole(formData: FormData) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()

  const label = String(formData.get("label") ?? "").trim()
  const sourceRole = String(formData.get("sourceRole") ?? "").trim()
  const role = makeOrgRoleCode(orgId, label)

  const existing = await db.rolePermission.findFirst({ where: { role }, select: { id: true } })
  if (existing) throw new Error("Такая должность уже есть")

  const sourceRows = sourceRole && canManageRoleInOrg(sourceRole, orgId)
    ? await db.rolePermission.findMany({
        where: { role: sourceRole },
        select: { section: true, canView: true, canEdit: true },
      })
    : []

  const rows = sourceRows.length > 0
    ? sourceRows
    : [
        { section: "dashboard", canView: true, canEdit: false },
        { section: "profile", canView: true, canEdit: false },
      ]

  await db.rolePermission.createMany({
    data: rows.map((row) => ({
      role,
      section: row.section,
      canView: row.canView,
      canEdit: row.canEdit,
    })),
    skipDuplicates: true,
  })

  await audit({
    action: "CREATE",
    entity: "user",
    entityId: role,
    details: { scope: "role", label, sourceRole: sourceRole || null, orgId },
  })

  invalidateAclCache()
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/roles")
  revalidatePath("/admin/users")
}

export async function deleteRole(role: string) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()

  if (isSystemRole(role)) throw new Error("Системную роль удалить нельзя")
  if (!canManageRoleInOrg(role, orgId)) throw new Error("Эту должность нельзя удалить в текущей организации")

  const users = await db.user.count({ where: { organizationId: orgId, role } })
  if (users > 0) {
    throw new Error(`Нельзя удалить должность: она назначена ${users} пользовател${users === 1 ? "ю" : "ям"}`)
  }

  await db.rolePermission.deleteMany({ where: { role } })

  await audit({
    action: "DELETE",
    entity: "user",
    entityId: role,
    details: { scope: "role", orgId },
  })

  invalidateAclCache()
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/roles")
  revalidatePath("/admin/users")
}
