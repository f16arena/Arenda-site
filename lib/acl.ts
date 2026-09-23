import { db } from "./db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export const SECTIONS = [
  "dashboard", "buildings", "spaces", "tenants", "finances", "meters",
  "contracts", "requests", "tasks", "staff", "complaints", "messages",
  "analytics", "settings", "roles", "users", "documents", "profile",
] as const
export type Section = (typeof SECTIONS)[number]

// Подписи страниц живут в словаре: adminRefs.sections.<секция>. Здесь только
// коды — они лежат в таблице прав (role_permissions.section), и переводить их
// нельзя.

// Дефолтные права (если таблица в БД ещё не создана либо записей нет)
const DEFAULT_PERMS: Record<string, Set<Section>> = {
  ADMIN: new Set<Section>([
    "dashboard","buildings","spaces","tenants","finances","meters","contracts",
    "requests","tasks","staff","complaints","messages","analytics","settings","roles","documents","profile",
  ]),
  ACCOUNTANT: new Set<Section>([
    "dashboard","buildings","spaces","tenants","finances","meters","contracts","staff","messages","analytics","documents","profile",
  ]),
  FACILITY_MANAGER: new Set<Section>([
    "dashboard","buildings","spaces","meters","requests","tasks","complaints","messages","profile",
  ]),
  TENANT: new Set<Section>(["profile"]),
}

const DEFAULT_EDIT_PERMS: Record<string, Set<Section>> = {
  ADMIN: DEFAULT_PERMS.ADMIN,
  ACCOUNTANT: new Set<Section>(["finances", "documents", "messages", "profile"]),
  FACILITY_MANAGER: new Set<Section>(["meters", "requests", "tasks", "complaints", "messages", "profile"]),
  TENANT: new Set<Section>(),
}

// Кеш прав на организацию — права меняются редко.
// Раньше кеш был один на всю платформу вместе с самой таблицей прав.
const cache = new Map<string, { permissions: Record<string, Record<string, { canView: boolean; canEdit: boolean }>>; ts: number }>()
const CACHE_TTL_MS = 30_000

/** Организация текущего пользователя — права читаются только её. */
async function currentOrgId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.organizationId ?? null
}

async function loadPermissions(orgId: string | null) {
  if (!orgId) return {} as Record<string, Record<string, { canView: boolean; canEdit: boolean }>>
  const hit = cache.get(orgId)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.permissions

  let rows: { role: string; section: string; canView: boolean; canEdit: boolean }[] = []
  try {
    rows = await db.rolePermission.findMany({
      where: { organizationId: orgId },
      select: { role: true, section: true, canView: true, canEdit: true },
    })
  } catch {
    // Таблица ещё не создана — fallback на дефолтные права
    rows = []
  }

  const permissions: Record<string, Record<string, { canView: boolean; canEdit: boolean }>> = {}
  for (const r of rows) {
    if (!permissions[r.role]) permissions[r.role] = {}
    permissions[r.role][r.section] = { canView: r.canView, canEdit: r.canEdit }
  }
  cache.set(orgId, { permissions, ts: Date.now() })
  return permissions
}

/** Сбросить кеш прав: одной организации или всех. */
export function invalidateAclCache(orgId?: string) {
  if (orgId) cache.delete(orgId)
  else cache.clear()
}

// OWNER всегда может всё (даже если в БД не настроено)
export async function canView(role: string, section: Section, orgId?: string | null): Promise<boolean> {
  if (role === "OWNER") return true
  const all = await loadPermissions(orgId ?? (await currentOrgId()))
  const fromDb = all[role]?.[section]?.canView
  if (fromDb !== undefined) return fromDb
  // Fallback на дефолты если в БД ничего нет
  return DEFAULT_PERMS[role]?.has(section) ?? false
}

export async function canEdit(role: string, section: Section, orgId?: string | null): Promise<boolean> {
  if (role === "OWNER") return true
  const all = await loadPermissions(orgId ?? (await currentOrgId()))
  const fromDb = all[role]?.[section]?.canEdit
  if (fromDb !== undefined) return fromDb
  // Fallback: ADMIN может редактировать всё что видит, остальные только в своих секциях
  return DEFAULT_EDIT_PERMS[role]?.has(section) ?? false
}

export async function requireSection(section: Section, action: "view" | "edit" = "view") {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const role = session.user.role
  const orgId = session.user.organizationId ?? null
  const ok = action === "edit"
    ? await canEdit(role, section, orgId)
    : await canView(role, section, orgId)

  if (!ok) redirect("/admin")
  return session
}

// Возвращает все разрешённые секции для роли — для фильтрации сайдбара
export async function getAllowedSections(role: string, orgId?: string | null): Promise<Set<Section>> {
  if (role === "OWNER") return new Set(SECTIONS)
  const all = await loadPermissions(orgId ?? (await currentOrgId()))
  const hasAnyInDb = !!all[role] && Object.keys(all[role]).length > 0

  if (hasAnyInDb) {
    const allowed = new Set<Section>()
    for (const s of SECTIONS) {
      if (all[role][s]?.canView) allowed.add(s)
    }
    return allowed
  }

  // Fallback: используем дефолтные права если БД пуста или таблица отсутствует
  return DEFAULT_PERMS[role] ?? new Set<Section>()
}

export function fallbackCanView(role: string, section: Section): boolean {
  return DEFAULT_PERMS[role]?.has(section) ?? false
}

export function fallbackCanEdit(role: string, section: Section): boolean {
  return DEFAULT_EDIT_PERMS[role]?.has(section) ?? false
}
