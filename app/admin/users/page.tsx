export const dynamic = "force-dynamic"

import Link from "next/link"
import { db } from "@/lib/db"
import { fallbackCanEdit, fallbackCanView, requireSection } from "@/lib/acl"
import { ROLE_COLORS, cn } from "@/lib/utils"
import { AlertTriangle, CheckCircle2, History, Shield, Users as UsersIcon } from "lucide-react"
import { requireOrgAccess } from "@/lib/org"
import {
  ACTION_CAPABILITIES,
  ACTION_CAPABILITY_GROUPS,
  capabilityDescription,
  capabilityGroupDescription,
  capabilityGroupLabel,
  capabilityLabel,
  getAllowedCapabilityKeysForUser,
  isFeatureAvailableInPlan,
} from "@/lib/capabilities"
import { planFeatureLabel } from "@/lib/plan-capabilities"
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
  RowInactiveBadge,
  UserApprovalButtons,
  UserCapabilitiesDialog,
  ResetPasswordDialog,
  ToggleActiveButton,
  UserRow,
} from "./user-actions"
import { APPROVAL_PENDING, APPROVAL_REJECTED } from "@/lib/approval"
import { PageHeader } from "@/components/ui/page"
import { RouteTabs } from "@/components/ui/route-tabs"
import { teamTabs } from "@/lib/hub-tabs"
import { getT, getLocale } from "@/lib/i18n/server"
import { formatDateL } from "@/lib/i18n/format"

// Системные роли: подписи берём из словаря, свои должности организации —
// как их назвал владелец (перевод им не нужен).
const SYSTEM_ROLE_KEYS = ["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE", "TENANT"] as const
type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number]
function isSystemRoleKey(role: string): role is SystemRoleKey {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(role)
}

// Переводчик страницы: нужен и вложенным компонентам (ячейка итоговых прав).
type PageTranslator = Awaited<ReturnType<typeof getT>>

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

type AccessReviewItem = {
  userId: string
  name: string
  role: string
  roleLabel: string
  reasons: Array<{ label: string; tone: "amber" | "purple" | "red" }>
  score: number
}

export default async function UsersPage() {
  const session = await requireSection("users", "view")
  const { orgId } = await requireOrgAccess()
  const translator = await getT()
  const { t } = translator
  const locale = await getLocale()
  const roleLabel = (role: string) =>
    isSystemRoleKey(role) ? t(`adminSettings.roles.systemRoles.${role}`) : displayRoleLabel(role)

  const [users, buildings, roleRows, org, currentCapabilityKeys] = await Promise.all([
    db.user.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        approvalStatus: true,
        approvalRequestedAt: true,
        rejectionReason: true,
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
        where: { organizationId: orgId },
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
          organizationId: orgId,
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
  // Подписи прав подставляем на сервере: диалог личных прав — клиентский, и
  // весь справочник adminRefs в браузер отправлять не нужно.
  const capabilityGroups = ACTION_CAPABILITY_GROUPS.map((group) => ({
    key: group.key,
    label: capabilityGroupLabel(t, group),
    description: capabilityGroupDescription(t, group),
    capabilities: group.capabilities.map((capability) => capability.key),
  }))
  const capabilities = ACTION_CAPABILITIES.map((capability) => ({
    key: capability.key,
    label: capabilityLabel(t, capability),
    description: capabilityDescription(t, capability),
    section: capability.section,
    level: capability.level,
    risk: capability.risk ?? "normal",
    requiredFeature: capability.requiredFeature ?? null,
    requiredFeatureLabel: capability.requiredFeature ? planFeatureLabel(t, capability.requiredFeature) : null,
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
      where: { organizationId: orgId, role: { in: permissionRoleCodes } },
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

  const accessReviewItems = users
    .map((user): AccessReviewItem | null => {
      const summary = effectiveRightsByUserId.get(user.id)
      if (!summary) return null

      const reasons: AccessReviewItem["reasons"] = []
      const personalCount = summary.personalAllow + summary.personalDeny
      const staffWithoutBuildings = user.isActive && isStaffLikeRole(user.role) && user.buildingAccess.length === 0

      if (user.role !== "OWNER" && summary.highRisk > 0) {
        reasons.push({ label: t("adminSettings.users.reasons.highRisk", { count: summary.highRisk }), tone: "amber" })
      }
      if (personalCount > 0) {
        reasons.push({ label: t("adminSettings.users.reasons.personal", { count: personalCount }), tone: "purple" })
      }
      if (staffWithoutBuildings) {
        reasons.push({ label: t("adminSettings.users.reasons.noBuildings"), tone: "red" })
      }
      if (!user.isActive && personalCount > 0) {
        reasons.push({ label: t("adminSettings.users.reasons.inactiveWithRights"), tone: "red" })
      }

      if (reasons.length === 0) return null

      return {
        userId: user.id,
        name: user.name,
        role: user.role,
        roleLabel: roleLabel(user.role),
        reasons,
        score: (user.role !== "OWNER" ? summary.highRisk : 0) + personalCount * 2 + (staffWithoutBuildings ? 10 : 0),
      }
    })
    .filter((item): item is AccessReviewItem => Boolean(item))
    .sort((a, b) => b.score - a.score)

  const accessReviewStats = {
    riskyUsers: accessReviewItems.filter((item) => item.reasons.some((reason) => reason.tone === "amber")).length,
    personalOverrides: Array.from(effectiveRightsByUserId.values()).reduce(
      (sum, summary) => sum + summary.personalAllow + summary.personalDeny,
      0,
    ),
    staffWithoutBuildings: users.filter((user) => user.isActive && isStaffLikeRole(user.role) && user.buildingAccess.length === 0).length,
    lockedByPlan: capabilities.filter((capability) => capability.locked).length,
  }

  const byRole = users.reduce<Record<string, number>>((acc, user) => {
    if (user.isActive) acc[user.role] = (acc[user.role] ?? 0) + 1
    return acc
  }, {})
  const pendingUsers = users.filter((user) => user.approvalStatus === APPROVAL_PENDING)

  return (
    <div className="space-y-5">
      <RouteTabs items={teamTabs(t)} className="mb-2" />
      <PageHeader
        icon={Shield}
        tone="violet"
        title={t("adminSettings.users.title")}
        subtitle={t("adminSettings.users.subtitle")}
        actions={
          <>
            <Link
              href="/admin/audit?type=permissions"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-800 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <History className="h-4 w-4" />
              {t("adminSettings.users.permissionsLog")}
            </Link>
            {currentCapabilities.has("users.invite") && (
              <CreateUserDialog buildings={buildings} roleOptions={roleOptions} />
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {roleOptions.slice(0, 10).map((role) => (
          <div key={role.value} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{byRole[role.value] ?? 0}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{roleLabel(role.value)}</p>
          </div>
        ))}
      </div>

      {pendingUsers.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-100">{t("adminSettings.users.pendingTitle")}</p>
          <p className="mt-1 text-xs text-amber-200/75">
            {t("adminSettings.users.pendingHint")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingUsers.slice(0, 6).map((user) => (
              <span key={user.id} className="rounded-full border border-amber-500/30 bg-slate-50 dark:bg-slate-950/40 px-3 py-1 text-xs text-amber-700 dark:text-amber-100">
                {user.name} · {roleLabel(user.role)}
              </span>
            ))}
            {pendingUsers.length > 6 && (
              <span className="rounded-full border border-amber-500/30 px-3 py-1 text-xs text-amber-700 dark:text-amber-100">
                +{pendingUsers.length - 6}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-800 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Shield className="h-4 w-4 text-blue-700 dark:text-blue-300" />
              {t("adminSettings.users.reviewTitle")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t("adminSettings.users.reviewHint")}
            </p>
          </div>
          <Link
            href="/admin/data-quality"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100"
          >
            {t("adminSettings.users.dataQuality")}
          </Link>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <AccessReviewMetric label={t("adminSettings.users.metrics.risky")} value={accessReviewStats.riskyUsers} tone={accessReviewStats.riskyUsers > 0 ? "amber" : "emerald"} />
          <AccessReviewMetric label={t("adminSettings.users.metrics.personal")} value={accessReviewStats.personalOverrides} tone={accessReviewStats.personalOverrides > 0 ? "purple" : "emerald"} />
          <AccessReviewMetric label={t("adminSettings.users.metrics.withoutBuildings")} value={accessReviewStats.staffWithoutBuildings} tone={accessReviewStats.staffWithoutBuildings > 0 ? "red" : "emerald"} />
          <AccessReviewMetric label={t("adminSettings.users.metrics.lockedByPlan")} value={accessReviewStats.lockedByPlan} tone="slate" />
        </div>

        {accessReviewItems.length > 0 ? (
          <div className="border-t border-slate-200 dark:border-slate-800 p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              {t("adminSettings.users.checkFirst")}
            </p>
            <div className="grid gap-2 lg:grid-cols-2">
              {accessReviewItems.slice(0, 6).map((item) => (
                <div key={item.userId} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.roleLabel}</p>
                    </div>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      ROLE_COLORS[item.role] ?? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
                    )}>
                      {item.roleLabel}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.reasons.map((reason) => (
                      <AccessReasonPill key={reason.label} reason={reason} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="border-t border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700 dark:text-emerald-300" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-100">{t("adminSettings.users.allGoodTitle")}</p>
                <p className="mt-1 text-xs text-emerald-200/70">
                  {t("adminSettings.users.allGoodHint")}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">{t("adminSettings.users.columns.user")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">{t("adminSettings.users.columns.role")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">{t("adminSettings.users.columns.contacts")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">{t("adminSettings.users.columns.buildings")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">{t("adminSettings.users.columns.profile")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">{t("adminSettings.users.columns.rights")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">{t("adminSettings.users.columns.created")}</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">{t("adminSettings.users.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === session.user.id
              const effectiveRights = effectiveRightsByUserId.get(user.id)
              const inheritedRights = inheritedRightsByUserId.get(user.id)
              return (
                <UserRow key={user.id} initialActive={user.isActive}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{user.name[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                          {user.name}
                          {isSelf && (
                            <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">{t("adminSettings.users.you")}</span>
                          )}
                          <RowInactiveBadge />
                          {user.approvalStatus === APPROVAL_PENDING && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-200">{t("adminSettings.users.pendingApproval")}</span>
                          )}
                          {user.approvalStatus === APPROVAL_REJECTED && (
                            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-200">
                              {t("adminSettings.users.approval.rejectedBadge")}
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-xs text-slate-500">{user.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      ROLE_COLORS[user.role] ?? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
                    )}>
                      {roleLabel(user.role)}
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
                      <span className="text-xs text-emerald-400">{t("adminSettings.users.allBuildings")}</span>
                    ) : isStaffLikeRole(user.role) ? (
                      user.buildingAccess.length > 0 ? (
                        <span className="text-xs">{user.buildingAccess.map((access) => access.building.name).join(", ")}</span>
                      ) : (
                        <span className="text-xs text-amber-400">{t("adminSettings.users.notAssigned")}</span>
                      )
                    ) : (
                      <span className="text-xs text-slate-500">{t("adminSettings.users.byProfile")}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400">
                    {user.tenant ? (
                      <span className="text-xs">{t("adminSettings.users.tenantProfile", { name: user.tenant.companyName })}</span>
                    ) : user.staff ? (
                      <span className="text-xs">{user.staff.position}</span>
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {effectiveRights ? (
                      <EffectiveRightsCell summary={effectiveRights} tr={translator} />
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">
                    {formatDateL(locale, user.createdAt)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      {user.approvalStatus === APPROVAL_PENDING && user.role !== "OWNER" && (
                        <UserApprovalButtons userId={user.id} userName={user.name} />
                      )}
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
                          roleLabel={roleLabel(user.role)}
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
                </UserRow>
              )
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center">
                  <UsersIcon className="mx-auto mb-2 h-8 w-8 text-slate-700" />
                  <p className="text-sm text-slate-500">{t("adminSettings.users.empty")}</p>
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

function EffectiveRightsCell({ summary, tr }: { summary: EffectiveRightsSummary; tr: PageTranslator }) {
  const personalCount = summary.personalAllow + summary.personalDeny
  return (
    <div className="flex max-w-52 flex-wrap gap-1.5">
      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-200">
        {tr.tp("adminSettings.users.rights.allowed", summary.allowed)}
      </span>
      {summary.highRisk > 0 && (
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-200">
          {tr.t("adminSettings.users.rights.risk", { count: summary.highRisk })}
        </span>
      )}
      {personalCount > 0 && (
        <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:text-purple-200">
          {tr.t("adminSettings.users.rights.personal", { count: personalCount })}
        </span>
      )}
      {summary.locked > 0 && (
        <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[11px] font-medium text-slate-400">
          {tr.t("adminSettings.users.rights.plan", { count: summary.locked })}
        </span>
      )}
    </div>
  )
}

function AccessReviewMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "amber" | "emerald" | "purple" | "red" | "slate"
}) {
  const tones = {
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200",
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    purple: "border-purple-500/25 bg-purple-500/10 text-purple-700 dark:text-purple-200",
    red: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-200",
    slate: "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-700 dark:text-slate-300",
  }

  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs opacity-75">{label}</p>
    </div>
  )
}

function AccessReasonPill({ reason }: { reason: AccessReviewItem["reasons"][number] }) {
  const tones = {
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
    purple: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-200",
    red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200",
  }

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[reason.tone]}`}>
      {reason.label}
    </span>
  )
}
