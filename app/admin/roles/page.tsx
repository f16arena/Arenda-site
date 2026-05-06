export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Shield, AlertTriangle, Lock } from "lucide-react"
import { db } from "@/lib/db"
import { SECTIONS, SECTION_LABELS } from "@/lib/acl"
import { requireOrgAccess } from "@/lib/org"
import { PLAN_CAPABILITIES } from "@/lib/plan-capabilities"
import {
  ACTION_CAPABILITIES,
  ACTION_CAPABILITY_GROUPS,
  isFeatureAvailableInPlan,
} from "@/lib/capabilities"
import {
  ROLE_SECTION_GROUPS,
  SECTION_REQUIRED_FEATURE,
  buildRoleOptions,
  displayRoleLabel,
} from "@/lib/role-capabilities"
import { PermissionsMatrix } from "./permissions-matrix"

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  ADMIN: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  ACCOUNTANT: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  FACILITY_MANAGER: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  EMPLOYEE: "bg-slate-500/10 text-slate-300 border-slate-500/30",
}

export default async function RolesPage() {
  const session = await auth()
  if (!session || !["OWNER", "ADMIN"].includes(session.user.role)) redirect("/admin")

  const { orgId } = await requireOrgAccess()
  const isOwner = session.user.role === "OWNER"

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: { select: { name: true, features: true } } },
  })
  const planFeatureJson = org?.plan?.features
  const featureLabels = new Map(PLAN_CAPABILITIES.map((feature) => [feature.key, feature.label]))
  const roleBuilderEnabled = isFeatureAvailableInPlan(planFeatureJson, "roleBuilder")

  let rows: { role: string; section: string; canView: boolean; canEdit: boolean }[] = []
  let migrationMissing = false
  try {
    rows = await db.rolePermission.findMany({
      select: { role: true, section: true, canView: true, canEdit: true },
    })
  } catch {
    migrationMissing = true
  }

  const users = await db.user.findMany({
    where: { organizationId: orgId },
    select: { role: true, isActive: true },
  })

  const roles = buildRoleOptions(
    [...rows.map((row) => row.role), ...users.map((user) => user.role)],
    orgId,
  ).filter((role) => role.value !== "TENANT")

  const userCounts = users.reduce<Record<string, number>>((acc, user) => {
    if (user.isActive) acc[user.role] = (acc[user.role] ?? 0) + 1
    return acc
  }, {})

  const map: Record<string, Record<string, { canView: boolean; canEdit: boolean }>> = {}
  for (const row of rows) {
    if (!map[row.role]) map[row.role] = {}
    map[row.role][row.section] = { canView: row.canView, canEdit: row.canEdit }
  }

  const sections = SECTIONS.map((section) => {
    const requiredFeature = SECTION_REQUIRED_FEATURE[section]
    return {
      key: section,
      label: SECTION_LABELS[section],
      requiredFeature: requiredFeature ?? null,
      requiredFeatureLabel: requiredFeature ? featureLabels.get(requiredFeature) ?? requiredFeature : null,
      locked: !!requiredFeature && !isFeatureAvailableInPlan(planFeatureJson, requiredFeature),
    }
  })

  const groups = ROLE_SECTION_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter((section) => SECTIONS.includes(section)),
  }))

  const editable = isOwner && !migrationMissing && roleBuilderEnabled

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

  const capabilityGroups = ACTION_CAPABILITY_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    description: group.description,
    capabilities: group.capabilities.map((capability) => capability.key),
  }))

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
            <Shield className="h-5 w-5 text-purple-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Должности и права</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Роль теперь работает как набор разрешений: страницы, кнопки и серверные действия проверяются отдельно.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
          <p className="font-medium text-slate-100">{org?.plan?.name ?? "Тариф не выбран"}</p>
          <p className="mt-1 text-xs text-slate-500">
            Конструктор должностей: {roleBuilderEnabled ? "включен" : "недоступен в тарифе"}
          </p>
        </div>
      </div>

      {migrationMissing && (
        <Notice
          tone="amber"
          title="Таблица прав не создана"
          text="Система использует старые fallback-права. Запустите миграции или deploy-script, затем обновите страницу."
        />
      )}

      {!roleBuilderEnabled && (
        <Notice
          tone="blue"
          title="Функция закрыта тарифом"
          text="Владелец видит текущие права, но менять должности сможет только после включения возможности «Конструктор должностей» в тарифе."
          icon={Lock}
        />
      )}

      <PermissionsMatrix
        roles={roles.map((role) => ({
          key: role.value,
          label: role.label || displayRoleLabel(role.value),
          color: ROLE_COLORS[role.value] ?? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
          system: role.system,
          userCount: userCounts[role.value] ?? 0,
        }))}
        sections={sections}
        groups={groups}
        capabilities={capabilities}
        capabilityGroups={capabilityGroups}
        permissions={map}
        editable={editable}
      />
    </div>
  )
}

function Notice({
  tone,
  title,
  text,
  icon: Icon = AlertTriangle,
}: {
  tone: "amber" | "blue"
  title: string
  text: string
  icon?: React.ElementType
}) {
  const styles = tone === "amber"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
    : "border-blue-500/30 bg-blue-500/10 text-blue-200"
  const iconColor = tone === "amber" ? "text-amber-300" : "text-blue-300"

  return (
    <div className={`rounded-xl border p-4 ${styles}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm opacity-90">{text}</p>
        </div>
      </div>
    </div>
  )
}
