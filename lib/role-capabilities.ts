import type { Section } from "@/lib/acl"

export type RoleOption = {
  value: string
  label: string
  system: boolean
}

export type RoleSectionGroup = {
  key: string
  sections: Section[]
}

// Подписи системных должностей берутся из словаря
// (adminSettings.roles.systemRoles) там, где их видит владелец. Русский текст
// здесь остаётся: он идёт в поле «должность» нового сотрудника (это данные в
// базе, а не интерфейс) и работает запасным для своих должностей организации.
export const SYSTEM_ROLE_OPTIONS: RoleOption[] = [
  { value: "OWNER", label: "Владелец", system: true },
  { value: "ADMIN", label: "Администратор", system: true },
  { value: "ACCOUNTANT", label: "Бухгалтер", system: true },
  { value: "FACILITY_MANAGER", label: "Техник / эксплуатация", system: true },
  { value: "EMPLOYEE", label: "Сотрудник", system: true },
  { value: "TENANT", label: "Арендатор", system: true },
]

const SYSTEM_ROLE_LABELS = new Map(SYSTEM_ROLE_OPTIONS.map((role) => [role.value, role.label]))
const SYSTEM_ROLE_VALUES = new Set(SYSTEM_ROLE_OPTIONS.map((role) => role.value))

// Группировка страниц в матрице прав. Подписи — adminRefs.sectionGroups.<ключ>:
// здесь только состав групп и порядок.
export const ROLE_SECTION_GROUPS: RoleSectionGroup[] = [
  {
    key: "workspace",
    sections: ["dashboard", "buildings", "spaces", "tenants", "profile"],
  },
  {
    key: "money",
    sections: ["finances", "contracts", "documents", "analytics"],
  },
  {
    key: "operations",
    sections: ["meters", "requests", "tasks", "staff", "complaints", "messages"],
  },
  {
    key: "control",
    sections: ["settings", "roles", "users"],
  },
]

export const SECTION_REQUIRED_FEATURE: Partial<Record<Section, string>> = {
  analytics: "ownerReports",
  contracts: "contractTemplates",
  documents: "documentTemplates",
  finances: "invoices",
  meters: "meters",
  requests: "requests",
  roles: "roleBuilder",
  tasks: "tasks",
}

export function isSystemRole(role: string) {
  return SYSTEM_ROLE_VALUES.has(role)
}

export function isOwnerRole(role: string) {
  return role === "OWNER"
}

export function isTenantRole(role: string) {
  return role === "TENANT"
}

export function isStaffLikeRole(role: string) {
  return !isOwnerRole(role) && !isTenantRole(role)
}

export function orgRolePrefix(orgId: string) {
  return `ORG_${orgId.slice(0, 8).toUpperCase()}:`
}

export function makeOrgRoleCode(orgId: string, label: string) {
  const safeLabel = label.trim().replace(/\s+/g, " ").slice(0, 60)
  if (!safeLabel) throw new Error("Укажите название должности")
  return `${orgRolePrefix(orgId)}${safeLabel}`
}

export function isOrgCustomRole(role: string, orgId: string) {
  return role.startsWith(orgRolePrefix(orgId))
}

export function canManageRoleInOrg(role: string, orgId: string) {
  return isSystemRole(role) || isOrgCustomRole(role, orgId)
}

export function displayRoleLabel(role: string) {
  const system = SYSTEM_ROLE_LABELS.get(role)
  if (system) return system
  const customLabel = role.includes(":") ? role.split(":").slice(1).join(":") : role
  return customLabel.replace(/_/g, " ").trim() || role
}

export function buildRoleOptions(roles: string[], orgId: string): RoleOption[] {
  const seen = new Set<string>()
  const options: RoleOption[] = []

  for (const systemRole of SYSTEM_ROLE_OPTIONS) {
    if (!seen.has(systemRole.value)) {
      seen.add(systemRole.value)
      options.push(systemRole)
    }
  }

  for (const role of roles) {
    if (!role || seen.has(role)) continue
    if (!canManageRoleInOrg(role, orgId)) continue
    seen.add(role)
    options.push({ value: role, label: displayRoleLabel(role), system: isSystemRole(role) })
  }

  return options
}
