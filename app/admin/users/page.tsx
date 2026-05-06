export const dynamic = "force-dynamic"

import Link from "next/link"
import { db } from "@/lib/db"
import { fallbackCanEdit, fallbackCanView, requireSection } from "@/lib/acl"
import { ROLE_COLORS, cn, formatDate } from "@/lib/utils"
import { History, Shield, Users as UsersIcon } from "lucide-react"
import { requireOrgAccess } from "@/lib/org"
import {
  ACTION_CAPABILITIES,
  ACTION_CAPABILITY_GROUPS,
  getAllowedCapabilityKeysForUser,
  isFeatureAvailableInPlan,
} from "@/lib/capabilities"
import { PLAN_CAPABILITIES } from "@/lib/plan-capabilities"
import { CAPABILITY_PERMISSION_PREFIX, capabilityKeyFromPermission, capabilityPermissionKey, userCapabilityRole } from "@/lib/capability-keys"
import {
  buildRoleOptions,
  displayRoleLabel,
  isStaffLikeRole,
} from "@/lib/role-capabilities"
import { safeServerValue } from "@/lib/server-fallback"
import {
  CreateUserDialog,
  DeleteUserButton,
  EditUserDialog,
  UserCapabilitiesDialog,
  ResetPasswordDialog,
  ToggleActiveButton,
} from "./user-actions"

type EffectiveCapabilityState = {
  allowed: boolean
  locked: boolean
  source: "owner" | "personal_allow" | "personal_deny" | "role_action" | "role_section" | "fallback" | "locked"
}

type EffectiveRightsSummary = {
  allowed: number
  highRisk: number
  locked: number
  personalAllow: number
  personalDeny: number
  states: Record<string, EffectiveCapabilityState>
}

export default async function UsersPage() {
  const session = await requireSection("users", "view")
  const { orgId } = await requireOrgAccess()

  const [users, buildings, roleRows, org, currentCapabilityKeys] = await Promise.all([
    db.user.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        tenant: { select: { id: true, companyName: true } },
        staff: { select: { id: true, position: true, salary: true } },
        buildingAccess: {
          select: { buildingId: true, building: { select: { name: true } } },
          orderBy: { building: { createdAt: "asc" } },
        },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    }),
    db.building.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    safeServerValue(
      db.rolePermission.findMany({
        select: { role: true },
        distinct: ["role"],
      }),
      [] as Array<{ role: string }>,
      { source: "admin.users.roleOptions", route: "/admin/users", orgId, userId: session.user.id },
    ),
    db.organization.findUnique({
      where: { id: orgId },
      select: { plan: { select: { features: true } } },
    }),
    getAllowedCapabilityKeysForUser({
      userId: session.user.id,
      role: session.user.role,
      isPlatformOwner: !!session.user.isPlatformOwner,
      orgId,
    }),
  ])

  const overrideRoles = users.map((user) => userCapabilityRole(user.id))
  const overrideRows = overrideRoles.length > 0
    ? await db.rolePermission.findMany({
        where: {
          role: { in: overrideRoles },
          section: { startsWith: CAPABILITY_PERMISSION_PREFIX },
        },
        select: { role: true, section: true, canView: true, canEdit: true },
      }).catch(() => [] as Array<{ role: string; section: string; canView: boolean; canEdit: boolean }>)
    : []

  const overridesByUserId = new Map<string, Record<string, "ALLOW" | "DENY">>()
  for (const row of overrideRows) {
    const userId = row.role.startsWith("user:") ? row.role.slice("user:".length) : null
    const capabilityKey = capabilityKeyFromPermission(row.section)
    if (!userId || !capabilityKey) continue
    const current = overridesByUserId.get(userId) ?? {}
    current[capabilityKey] = row.canView || row.canEdit ? "ALLOW" : "DENY"
    overridesByUserId.set(userId, current)
  }

  const planFeatureJson = org?.plan?.features ?? null
  const featureLabels = new Map(PLAN_CAPABILITIES.map((feature) => [feature.key, feature.label]))
  const capabilityGroups = ACTION_CAPABILITY_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    description: group.description,
    capabilities: group.capabilities.map((capability) => capability.key),
  }))
  const capabilities = ACTION_CAPABILITIES.map((capability) => ({
    key: capability.key,
    label: capability.label,
    description: capability.description,
    section: capability.section,
    level: capability.level,
    risk: capability.risk ?? "normal",
    requiredFeature: capability.requiredFeature ?? null,
    requiredFeatureLabel: capability.requiredFeature
      ? featureLabels.get(capability.requiredFeature) ?? capability.requiredFeature
      : null,
    locked: !!capability.requiredFeature && !isFeatureAvailableInPlan(planFeatureJson, capability.requiredFeature),
  }))

  const currentCapabilities = new Set(currentCapabilityKeys)

  const roleOptions = buildRoleOptions(
    [...roleRows.map((row) => row.role), ...users.map((user) => user.role)],
    orgId,
  )
  const permissionRoleCodes = [
    ...new Set([
      ...roleOptions.map((role) => role.value),
      ...users.map((user) => user.role),
      ...users.map((user) => userCapabilityRole(user.id)),
    ]),
  ]
  const permissionRows = await safeServerValue(
    db.rolePermission.findMany({
      where: { role: { in: permissionRoleCodes } },
      select: { role: true, section: true, canView: true, canEdit: true },
    }),
    [] as Array<{ role: string; section: string; canView: boolean; canEdit: boolean }>,
    { source: "admin.users.effectivePermissions", route: "/admin/users", orgId, userId: session.user.id },
  )
  const permissionsByRole = new Map<string, Record<string, { canView: boolean; canEdit: boolean }>>()
  for (const row of permissionRows) {
    const current = permissionsByRole.get(row.role) ?? {}
    current[row.section] = { canView: row.canView, canEdit: row.canEdit }
    permissionsByRole.set(row.role, current)
  }

  const effectiveRightsByUserId = new Map<string, EffectiveRightsSummary>()
  const inheritedRightsByUserId = new Map<string, EffectiveRightsSummary>()
  for (const user of users) {
    const rolePermissions = permissionsByRole.get(user.role) ?? {}
    effectiveRightsByUserId.set(
      user.id,
      resolveEffectiveRightsSummary({
        role: user.role,
        overrides: overridesByUserId.get(user.id) ?? {},
        capabilities,
        rolePermissions,
      }),
    )
    inheritedRightsByUserId.set(
      user.id,
      resolveEffectiveRightsSummary({
        role: user.role,
        overrides: {},
        capabilities,
        rolePermissions,
      }),
    )
  }

  const byRole = users.reduce<Record<string, number>>((acc, user) => {
    if (user.isActive) acc[user.role] = (acc[user.role] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
            <Shield className="h-5 w-5 text-purple-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Пользователи и доступ</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Назначайте должности, здания и доступы. Свои должности создаются в разделе «Должности и права».
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/audit?type=permissions"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
          >
            <History className="h-4 w-4" />
            Журнал прав
          </Link>
          {currentCapabilities.has("users.invite") && (
            <CreateUserDialog buildings={buildings} roleOptions={roleOptions} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {roleOptions.slice(0, 10).map((role) => (
          <div key={role.value} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-2xl font-bold text-slate-100">{byRole[role.value] ?? 0}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{role.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Пользователь</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Должность</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Контакты</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Здания</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Профиль</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Итоговые права</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Создан</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === session.user.id
              const effectiveRights = effectiveRightsByUserId.get(user.id)
              const inheritedRights = inheritedRightsByUserId.get(user.id)
              return (
                <tr
                  key={user.id}
                  className={cn(
                    "border-b border-slate-800/70 transition-colors hover:bg-slate-800/50",
                    !user.isActive && "opacity-50",
                  )}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800">
                        <span className="text-xs font-bold text-slate-300">{user.name[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="flex items-center gap-2 font-medium text-slate-100">
                          {user.name}
                          {isSelf && (
                            <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-purple-300">вы</span>
                          )}
                          {!user.isActive && (
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">неактивен</span>
                          )}
                        </p>
                        <p className="font-mono text-xs text-slate-500">{user.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      ROLE_COLORS[user.role] ?? "bg-indigo-500/10 text-indigo-300",
                    )}>
                      {displayRoleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-400">
                    <div className="space-y-0.5">
                      {user.email && <p className="text-xs">{user.email}</p>}
                      {user.phone && <p className="font-mono text-xs">{user.phone}</p>}
                      {!user.email && !user.phone && <span className="text-slate-500">-</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-400">
                    {user.role === "OWNER" ? (
                      <span className="text-xs text-emerald-400">Все здания</span>
                    ) : isStaffLikeRole(user.role) ? (
                      user.buildingAccess.length > 0 ? (
                        <span className="text-xs">{user.buildingAccess.map((access) => access.building.name).join(", ")}</span>
                      ) : (
                        <span className="text-xs text-amber-400">Не назначено</span>
                      )
                    ) : (
                      <span className="text-xs text-slate-500">По профилю</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400">
                    {user.tenant ? (
                      <span className="text-xs">Арендатор: {user.tenant.companyName}</span>
                    ) : user.staff ? (
                      <span className="text-xs">{user.staff.position}</span>
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {effectiveRights ? (
                      <EffectiveRightsCell summary={effectiveRights} />
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      {currentCapabilities.has("users.edit") && (
                        <EditUserDialog
                          user={{
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            phone: user.phone,
                            role: user.role,
                            buildingIds: user.buildingAccess.map((access) => access.buildingId),
                          }}
                          buildings={buildings}
                          roleOptions={roleOptions}
                        />
                      )}
                      {currentCapabilities.has("roles.editActions") && !isSelf && user.role !== "OWNER" && (
                        <UserCapabilitiesDialog
                          userId={user.id}
                          userName={user.name}
                          capabilities={capabilities}
                          capabilityGroups={capabilityGroups}
                          overrides={overridesByUserId.get(user.id) ?? {}}
                          effectiveSummary={effectiveRights}
                          effectiveStates={effectiveRights?.states ?? {}}
                          inheritedStates={inheritedRights?.states ?? {}}
                          roleLabel={displayRoleLabel(user.role)}
                        />
                      )}
                      {currentCapabilities.has("users.resetPassword") && (
                        <ResetPasswordDialog userId={user.id} userName={user.name} />
                      )}
                      {currentCapabilities.has("users.deactivate") && (
                        <ToggleActiveButton userId={user.id} isActive={user.isActive} disabled={isSelf} />
                      )}
                      {currentCapabilities.has("users.delete") && (
                        <DeleteUserButton userId={user.id} userName={user.name} disabled={isSelf} />
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center">
                  <UsersIcon className="mx-auto mb-2 h-8 w-8 text-slate-700" />
                  <p className="text-sm text-slate-500">Нет пользователей</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function resolveEffectiveRightsSummary({
  role,
  overrides,
  capabilities,
  rolePermissions,
}: {
  role: string
  overrides: Record<string, "ALLOW" | "DENY">
  capabilities: Array<{
    key: string
    section: Parameters<typeof fallbackCanView>[1]
    level: "view" | "edit" | "sensitive"
    risk: "normal" | "business" | "sensitive"
    locked: boolean
  }>
  rolePermissions: Record<string, { canView: boolean; canEdit: boolean }>
}): EffectiveRightsSummary {
  const summary: EffectiveRightsSummary = {
    allowed: 0,
    highRisk: 0,
    locked: 0,
    personalAllow: 0,
    personalDeny: 0,
    states: {},
  }

  for (const capability of capabilities) {
    const override = overrides[capability.key]
    if (override === "ALLOW") summary.personalAllow += 1
    if (override === "DENY") summary.personalDeny += 1

    const state = resolveCapabilityState({ role, capability, override, rolePermissions })
    summary.states[capability.key] = state

    if (state.locked) summary.locked += 1
    if (state.allowed && !state.locked) {
      summary.allowed += 1
      if (capability.risk !== "normal" || capability.level === "sensitive") summary.highRisk += 1
    }
  }

  return summary
}

function resolveCapabilityState({
  role,
  capability,
  override,
  rolePermissions,
}: {
  role: string
  capability: {
    key: string
    section: Parameters<typeof fallbackCanView>[1]
    level: "view" | "edit" | "sensitive"
    locked: boolean
  }
  override?: "ALLOW" | "DENY"
  rolePermissions: Record<string, { canView: boolean; canEdit: boolean }>
}): EffectiveCapabilityState {
  if (capability.locked) return { allowed: false, locked: true, source: "locked" }
  if (role === "OWNER") return { allowed: true, locked: false, source: "owner" }
  if (override === "ALLOW") return { allowed: true, locked: false, source: "personal_allow" }
  if (override === "DENY") return { allowed: false, locked: false, source: "personal_deny" }

  const permissionKey = capabilityPermissionKey(capability.key)
  const actionPermission = rolePermissions[permissionKey]
  if (actionPermission) {
    return {
      allowed: actionPermission.canView || actionPermission.canEdit,
      locked: false,
      source: "role_action",
    }
  }

  const sectionPermission = rolePermissions[capability.section]
  if (sectionPermission) {
    return {
      allowed: capability.level === "view" ? sectionPermission.canView : sectionPermission.canEdit,
      locked: false,
      source: "role_section",
    }
  }

  return {
    allowed: capability.level === "view"
      ? fallbackCanView(role, capability.section)
      : fallbackCanEdit(role, capability.section),
    locked: false,
    source: "fallback",
  }
}

function EffectiveRightsCell({ summary }: { summary: EffectiveRightsSummary }) {
  const personalCount = summary.personalAllow + summary.personalDeny
  return (
    <div className="flex max-w-52 flex-wrap gap-1.5">
      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-200">
        {summary.allowed} действий
      </span>
      {summary.highRisk > 0 && (
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
          риск {summary.highRisk}
        </span>
      )}
      {personalCount > 0 && (
        <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-200">
          личные {personalCount}
        </span>
      )}
      {summary.locked > 0 && (
        <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[11px] font-medium text-slate-400">
          тариф {summary.locked}
        </span>
      )}
    </div>
  )
}
