import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { cookies, headers } from "next/headers"
import { db } from "./db"

const SUPERADMIN_ORG_COOKIE = "superadmin_currentOrgId"
const IMPERSONATE_COOKIE = "impersonating"

export type OrgContext = {
  orgId: string
  userId: string
  isPlatformOwner: boolean
  isImpersonating: boolean
  hostSlug: string | null   // slug из URL поддомена, если есть
}

/**
 * Получает slug организации из URL (через заголовки от proxy.ts).
 * Возвращает null, если запрос пришёл с корневого домена.
 */
export async function getHostSlug(): Promise<string | null> {
  const h = await headers()
  return h.get("x-org-slug")
}

/**
 * По slug возвращает organizationId (или null).
 * Кешируется на запрос (через React cache при необходимости).
 */
export async function getOrgIdBySlug(slug: string): Promise<string | null> {
  if (!slug) return null
  const org = await db.organization.findUnique({
    where: { slug },
    select: { id: true, isActive: true, isSuspended: true },
  })
  if (!org || !org.isActive) return null
  return org.id
}

// Получить текущую организацию
// - Для обычного пользователя: его organizationId (всегда!).
//   Impersonate и superadmin cookies ИГНОРИРУЮТСЯ — обычный юзер не должен
//   наследовать чужой контекст из cookie, оставшегося от другой сессии.
// - Для платформа-админа: либо impersonate orgId (если он сам запустил),
//   либо выбранная в cookie организация.
export async function getCurrentOrgId(): Promise<string | null> {
  const session = await auth()
  if (!session?.user) return null

  const isPlatformOwner = session.user.isPlatformOwner ?? false

  // КРИТИЧНО: для НЕ-платформ-админа всегда возвращаем его собственную
  // организацию. Не смотрим в impersonate/superadmin cookies, даже если они
  // остались от предыдущей сессии (например после logout-login другим юзером).
  if (!isPlatformOwner) {
    return session.user.organizationId ?? null
  }

  // Платформа-админ — может быть в impersonate-режиме (если сам его запустил).
  // Проверяем что realUserId в cookie совпадает с текущим session user —
  // иначе игнорируем cookie.
  const imp = await getImpersonateData()
  if (imp && imp.realUserId === session.user.id) {
    const user = await db.user.findUnique({
      where: { id: imp.actAsUserId },
      select: { organizationId: true },
    })
    return user?.organizationId ?? null
  }

  // Платформа-админ без impersonate — берёт orgId из cookie superadmin
  const store = await cookies()
  return store.get(SUPERADMIN_ORG_COOKIE)?.value ?? null
}

export async function setSuperadminOrgCookie(orgId: string | null) {
  const store = await cookies()
  if (orgId) {
    store.set(SUPERADMIN_ORG_COOKIE, orgId, {
      maxAge: 60 * 60 * 24,
      path: "/",
      httpOnly: false,
      sameSite: "lax",
    })
  } else {
    store.delete(SUPERADMIN_ORG_COOKIE)
  }
}

// Helper: требует что пользователь имеет доступ к организации
// Возвращает контекст или редиректит.
//
// БЕЗОПАСНОСТЬ: дополнительно проверяет, что slug в URL поддомена соответствует
// organizationId пользователя. Если нет — редирект на /login (мы не должны
// случайно работать с чужой организацией, даже если cookie каким-то образом
// прошёл на чужой поддомен).
export async function requireOrgAccess(): Promise<OrgContext> {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const orgId = await getCurrentOrgId()
  const isPlatformOwner = session.user.isPlatformOwner ?? false
  const hostSlug = await getHostSlug()

  if (!orgId) {
    if (isPlatformOwner) redirect("/superadmin")
    else redirect("/login")
  }

  // Проверим что организация активна и не приостановлена
  const org = await db.organization.findUnique({
    where: { id: orgId! },
    select: { id: true, slug: true, isActive: true, isSuspended: true },
  }).catch(() => null)

  if (!org || !org.isActive) {
    if (isPlatformOwner) redirect("/superadmin")
    else redirect("/login")
  }

  // Проверка slug ↔ orgId. Включается через ENFORCE_SUBDOMAIN=true (после
  // настройки DNS на *.commrent.kz). Платформенный админ может работать на
  // любом поддомене (impersonate), потому пропускаем для него.
  if (
    process.env.ENFORCE_SUBDOMAIN === "true"
    && hostSlug
    && !isPlatformOwner
    && org!.slug !== hostSlug
  ) {
    redirect("/login")
  }

  const imp = await getImpersonateData()

  return {
    orgId: orgId!,
    userId: imp?.actAsUserId ?? session.user.id,
    isPlatformOwner,
    isImpersonating: !!imp,
    hostSlug,
  }
}

export async function requirePlatformOwner() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.isPlatformOwner) redirect("/admin")
  return { userId: session.user.id }
}

// Impersonate cookie helpers
export async function getImpersonateData(): Promise<{ actAsUserId: string; realUserId: string; orgId: string; startedAt: number } | null> {
  const store = await cookies()
  const raw = store.get(IMPERSONATE_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function setImpersonateData(data: { actAsUserId: string; realUserId: string; orgId: string; startedAt: number }) {
  const store = await cookies()
  store.set(IMPERSONATE_COOKIE, JSON.stringify(data), {
    maxAge: 60 * 60 * 8, // 8 часов
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  })
}

export async function clearImpersonate() {
  const store = await cookies()
  store.delete(IMPERSONATE_COOKIE)
}

// Получить план текущей организации (для проверок лимитов)
export async function getOrgPlan(orgId: string) {
  return db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true, name: true, isSuspended: true, planExpiresAt: true,
      plan: {
        select: {
          id: true, code: true, name: true,
          maxBuildings: true, maxTenants: true, maxUsers: true, maxLeads: true,
          features: true,
        },
      },
    },
  })
}

// Проверка фичи по плану
export function planHasFeature(features: string | null, key: string): boolean {
  if (!features) return false
  try {
    const obj = JSON.parse(features)
    return !!obj[key]
  } catch {
    return false
  }
}

// Проверка лимита перед созданием
export class LimitExceededError extends Error {
  constructor(public limit: string, public max: number, public current: number) {
    super(`Достигнут лимит ${limit} (${current}/${max}). Обновите тариф.`)
    this.name = "LimitExceededError"
  }
}

// Проверка что подписка активна (не истекла, не приостановлена)
export async function requireSubscriptionActive(orgId: string) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { isActive: true, isSuspended: true, planExpiresAt: true },
  })
  if (!org) throw new Error("Организация не найдена")
  if (!org.isActive) throw new Error("Организация деактивирована")
  if (org.isSuspended) throw new Error("Подписка приостановлена. Обратитесь в поддержку.")
  if (org.planExpiresAt && org.planExpiresAt < new Date()) {
    throw new Error("Подписка истекла. Продлите чтобы продолжить работу.")
  }
}

// Проверка фичи по плану — кидает понятную ошибку если нет
export async function requireFeature(orgId: string, key: string, label?: string) {
  const org = await getOrgPlan(orgId)
  if (!org?.plan) throw new Error("План не назначен")
  if (!planHasFeature(org.plan.features, key)) {
    throw new Error(`Функция "${label ?? key}" недоступна на тарифе ${org.plan.name}. Обновите тариф.`)
  }
}

export async function checkLimit(orgId: string, type: "buildings" | "tenants" | "users" | "leads") {
  const org = await getOrgPlan(orgId)
  if (!org?.plan) return // нет плана — пропускаем (для миграционного периода)

  const max = org.plan[`max${capitalize(type)}` as keyof typeof org.plan] as number | null
  if (max === null || max === undefined) return // безлимит

  const floorIds = (await db.floor.findMany({
    where: { building: { organizationId: orgId } },
    select: { id: true },
  })).map((f) => f.id)

  let current = 0
  if (type === "buildings") current = await db.building.count({ where: { organizationId: orgId } })
  else if (type === "tenants") current = await db.tenant.count({
    where: floorIds.length > 0
      ? { OR: [{ space: { floorId: { in: floorIds } } }, { spaceId: null }] }
      : undefined,
  })
  else if (type === "users") current = await db.user.count({ where: { organizationId: orgId } })
  else if (type === "leads") current = await db.lead.count({ where: { buildingId: { in: await orgBuildingIds(orgId) } } }).catch(() => 0)

  if (current >= max) {
    throw new LimitExceededError(type, max, current)
  }
}

async function orgBuildingIds(orgId: string): Promise<string[]> {
  return (await db.building.findMany({ where: { organizationId: orgId }, select: { id: true } }))
    .map((b) => b.id)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
