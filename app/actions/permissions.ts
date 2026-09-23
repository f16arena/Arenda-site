"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath, revalidateTag } from "next/cache"
import { requireOwner } from "@/lib/permissions"
import { invalidateAclCache, SECTIONS } from "@/lib/acl"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"
import { audit } from "@/lib/audit"
import { requireOrgAccess } from "@/lib/org"
import {
  ACTION_CAPABILITY_BY_KEY,
  capabilityPermissionKey,
  requireOrgFeature,
} from "@/lib/capabilities"
import { userCapabilityRole } from "@/lib/capability-keys"
import { getT } from "@/lib/i18n/server"
import {
  canManageRoleInOrg,
  isOwnerRole,
  isSystemRole,
  makeOrgRoleCode,
} from "@/lib/role-capabilities"

async function assertRoleBuilderEnabled(orgId: string) {
  await requireOrgFeature(orgId, "roleBuilder")
}

export async function setPermission(role: string, section: string, canView: boolean, canEdit: boolean) {
  const { t } = await getT()
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertRoleBuilderEnabled(orgId)

  if (!canManageRoleInOrg(role, orgId)) {
    throw new Error(t("actions.permissions.roleNotEditableInOrg"))
  }

  if (!SECTIONS.includes(section as (typeof SECTIONS)[number])) {
    throw new Error(t("actions.permissions.badSection"))
  }

  if (isOwnerRole(role)) {
    throw new Error(t("actions.permissions.ownerAlwaysFull"))
  }

  if (canEdit && !canView) canEdit = false

  await db.rolePermission.upsert({
    where: { organizationId_role_section: { organizationId: orgId, role, section } },
    update: { canView, canEdit },
    create: { organizationId: orgId, role, section, canView, canEdit },
  })

  await audit({
    action: "UPDATE",
    entity: "user",
    entityId: role,
    details: { scope: "role_permission", section, canView, canEdit, orgId },
  })

  invalidateAclCache(orgId)
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/roles", "layout")
}

export async function setCapability(role: string, capabilityKey: string, enabled: boolean) {
  const { t } = await getT()
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertRoleBuilderEnabled(orgId)

  if (!canManageRoleInOrg(role, orgId)) {
    throw new Error(t("actions.permissions.roleNotEditableInOrg"))
  }

  if (isOwnerRole(role)) {
    throw new Error(t("actions.permissions.ownerAlwaysFull"))
  }

  const capability = ACTION_CAPABILITY_BY_KEY.get(capabilityKey)
  if (!capability) {
    throw new Error(t("actions.permissions.badCapability"))
  }

  const section = capabilityPermissionKey(capabilityKey)
  await db.rolePermission.upsert({
    where: { organizationId_role_section: { organizationId: orgId, role, section } },
    update: { canView: enabled, canEdit: enabled },
    create: { organizationId: orgId, role, section, canView: enabled, canEdit: enabled },
  })

  await audit({
    action: "UPDATE",
    entity: "user",
    entityId: role,
    details: {
      scope: "role_capability",
      capability: capabilityKey,
      label: capability.label,
      enabled,
      orgId,
    },
  })

  invalidateAclCache(orgId)
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/roles", "layout")
}

export async function setUserCapabilityOverride(
  userId: string,
  capabilityKey: string,
  mode: "INHERIT" | "ALLOW" | "DENY",
) {
  const { t } = await getT()
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertRoleBuilderEnabled(orgId)

  const capability = ACTION_CAPABILITY_BY_KEY.get(capabilityKey)
  if (!capability) {
    throw new Error(t("actions.permissions.badCapability"))
  }

  const target = await db.user.findFirst({
    where: { id: userId, organizationId: orgId },
    select: { id: true, role: true, name: true },
  })
  if (!target) throw new Error(t("actions.permissions.userNotInOrg"))
  if (isOwnerRole(target.role)) throw new Error(t("actions.permissions.ownerAlwaysFull"))

  const role = userCapabilityRole(userId)
  const section = capabilityPermissionKey(capabilityKey)

  if (mode === "INHERIT") {
    await db.rolePermission.deleteMany({ where: { organizationId: orgId, role, section } })
  } else {
    const enabled = mode === "ALLOW"
    await db.rolePermission.upsert({
      where: { organizationId_role_section: { organizationId: orgId, role, section } },
      update: { canView: enabled, canEdit: enabled },
      create: { organizationId: orgId, role, section, canView: enabled, canEdit: enabled },
    })
  }

  await audit({
    action: "UPDATE",
    entity: "user",
    entityId: userId,
    details: {
      scope: "user_capability_override",
      capability: capabilityKey,
      label: capability.label,
      mode,
      targetName: target.name,
      orgId,
    },
  })

  invalidateAclCache(orgId)
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/users")
  revalidatePath("/admin/roles")
}

export async function createRole(formData: FormData) {
  const { t } = await getT()
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertRoleBuilderEnabled(orgId)

  const label = String(formData.get("label") ?? "").trim()
  const sourceRole = String(formData.get("sourceRole") ?? "").trim()
  const role = makeOrgRoleCode(orgId, label)

  const existing = await db.rolePermission.findFirst({ where: { organizationId: orgId, role }, select: { id: true } })
  if (existing) throw new Error(t("actions.permissions.roleExists"))

  const sourceRows = sourceRole && canManageRoleInOrg(sourceRole, orgId)
    ? await db.rolePermission.findMany({
        where: { organizationId: orgId, role: sourceRole },
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
      organizationId: orgId,
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

  invalidateAclCache(orgId)
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/roles")
  revalidatePath("/admin/users")
}

export async function deleteRole(role: string) {
  const { t, tp } = await getT()
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertRoleBuilderEnabled(orgId)

  if (isSystemRole(role)) throw new Error(t("actions.permissions.systemRoleNotDeletable"))
  if (!canManageRoleInOrg(role, orgId)) throw new Error(t("actions.permissions.roleNotDeletableInOrg"))

  const users = await db.user.count({ where: { organizationId: orgId, role } })
  if (users > 0) {
    throw new Error(tp("actions.permissions.roleInUse", users))
  }

  await db.rolePermission.deleteMany({ where: { organizationId: orgId, role } })

  await audit({
    action: "DELETE",
    entity: "user",
    entityId: role,
    details: { scope: "role", orgId },
  })

  invalidateAclCache(orgId)
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/roles")
  revalidatePath("/admin/users")
}
