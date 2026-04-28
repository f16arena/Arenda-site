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

// Кеш на запрос — права меняются редко
let cache: { permissions: Record<string, Record<string, { canView: boolean; canEdit: boolean }>>; ts: number } | null = null
const CACHE_TTL_MS = 30_000

async function loadPermissions() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.permissions

  const rows = await db.rolePermission.findMany()
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
  return all[role]?.[section]?.canView ?? false
}

export async function canEdit(role: string, section: Section): Promise<boolean> {
  if (role === "OWNER") return true
  const all = await loadPermissions()
  return all[role]?.[section]?.canEdit ?? false
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
  const allowed = new Set<Section>()
  for (const s of SECTIONS) {
    if (all[role]?.[s]?.canView) allowed.add(s)
  }
  return allowed
}
