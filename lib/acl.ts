import { db } from "./db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export const SECTIONS = [
  "dashboard", "buildings", "spaces", "tenants", "finances", "meters",
  "contracts", "requests", "tasks", "staff", "complaints", "messages",
  "analytics", "settings", "roles", "users", "documents", "profile",
] as const
export type Section = (typeof SECTIONS)[number]

export const SECTION_LABELS: Record<Section, string> = {
  dashboard: "Дашборд",
  buildings: "Здания",
  spaces: "Помещения",
  tenants: "Арендаторы",
  finances: "Финансы",
  meters: "Счётчики",
  contracts: "Договоры",
  requests: "Заявки",
  tasks: "Задачи",
  staff: "Сотрудники",
  complaints: "Жалобы",
  messages: "Сообщения",
  analytics: "Аналитика",
  settings: "Настройки",
  roles: "Роли и доступ",
  users: "Все пользователи (супер-админ)",
  documents: "Документы",
  profile: "Мой профиль",
}

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

// Кеш на запрос — права меняются редко
let cache: { permissions: Record<string, Record<string, { canView: boolean; canEdit: boolean }>>; ts: number } | null = null
const CACHE_TTL_MS = 30_000

async function loadPermissions() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.permissions

  let rows: { role: string; section: string; canView: boolean; canEdit: boolean }[] = []
  try {
    rows = await db.rolePermission.findMany({
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
  cache = { permissions, ts: Date.now() }
  return permissions
}

export function invalidateAclCache() {
  cache = null
}

// OWNER всегда может всё (даже если в БД не настроено)
export async function canView(role: string, section: Section): Promise<boolean> {
  if (role === "OWNER") return true
  const all = await loadPermissions()
  const fromDb = all[role]?.[section]?.canView
  if (fromDb !== undefined) return fromDb
  // Fallback на дефолты если в БД ничего нет
  return DEFAULT_PERMS[role]?.has(section) ?? false
}

export async function canEdit(role: string, section: Section): Promise<boolean> {
  if (role === "OWNER") return true
  const all = await loadPermissions()
  const fromDb = all[role]?.[section]?.canEdit
  if (fromDb !== undefined) return fromDb
  // Fallback: ADMIN может редактировать всё что видит, остальные только в своих секциях
  return DEFAULT_EDIT_PERMS[role]?.has(section) ?? false
}

export async function requireSection(section: Section, action: "view" | "edit" = "view") {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const role = session.user.role
  const ok = action === "edit"
    ? await canEdit(role, section)
    : await canView(role, section)

  if (!ok) redirect("/admin")
  return session
}

// Возвращает все разрешённые секции для роли — для фильтрации сайдбара
export async function getAllowedSections(role: string): Promise<Set<Section>> {
  if (role === "OWNER") return new Set(SECTIONS)
  const all = await loadPermissions()
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
