import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { cookies, headers } from "next/headers"
import { cache } from "react"
import { db } from "./db"
import { createHmac, timingSafeEqual } from "crypto"

const SUPERADMIN_ORG_COOKIE = "superadmin_currentOrgId"
const IMPERSONATE_COOKIE = "impersonating"
const IMPERSONATE_MAX_AGE_SECONDS = 60 * 60 * 8

// Платформенные cookie должны жить на всех *.commrent.kz — так же, как session-token
// (см. auth.ts). Иначе после редиректа с commrent.kz на slug-поддомен impersonate-
// и superadmin-контекст теряются (host-only cookie остаётся на корневом домене).
const PLATFORM_COOKIE_DOMAIN =
  process.env.NODE_ENV === "production" && process.env.ROOT_HOST
    ? `.${process.env.ROOT_HOST}`
    : undefined

type ImpersonateData = {
  actAsUserId: string
  realUserId: string
  orgId: string
  startedAt: number
}

type SessionUserForImpersonate = {
  id: string
  isPlatformOwner?: boolean | null
}

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
  // Приостановленная организация не должна резолвиться по slug (полная блокировка).
  if (!org || !org.isActive || org.isSuspended) return null
  return org.id
}

// Получить текущую организацию
// - Для обычного пользователя: его organizationId (всегда!).
//   Impersonate и superadmin cookies ИГНОРИРУЮТСЯ — обычный юзер не должен
//   наследовать чужой контекст из cookie, оставшегося от другой сессии.
// - Для платформа-админа: либо impersonate orgId (если он сам запустил),
//   либо выбранная в cookie организация.
//
// NOTE: обёрнуто в React cache() для дедупликации внутри одного request.
// Layout, page, breadcrumbs могут вызывать это N раз — теперь это 1 запрос.
export const getCurrentOrgId = cache(async (): Promise<string | null> => {
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
  const imp = await getValidatedImpersonateForUser(session.user)
  if (imp) {
    const user = await db.user.findUnique({
      where: { id: imp.actAsUserId },
      select: { organizationId: true },
    })
    return user?.organizationId ?? null
  }

  // Платформа-админ без impersonate — берёт orgId из cookie superadmin
  const store = await cookies()
  return store.get(SUPERADMIN_ORG_COOKIE)?.value ?? null
})

export async function setSuperadminOrgCookie(orgId: string | null) {
  const store = await cookies()
  if (orgId) {
    store.set(SUPERADMIN_ORG_COOKIE, orgId, {
      maxAge: 60 * 60 * 24,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      ...(PLATFORM_COOKIE_DOMAIN ? { domain: PLATFORM_COOKIE_DOMAIN } : {}),
    })
  } else {
    store.delete({ name: SUPERADMIN_ORG_COOKIE, path: "/", ...(PLATFORM_COOKIE_DOMAIN ? { domain: PLATFORM_COOKIE_DOMAIN } : {}) })
  }
}

// Helper: требует что пользователь имеет доступ к организации
// Возвращает контекст или редиректит.
//
// БЕЗОПАСНОСТЬ: дополнительно проверяет, что slug в URL поддомена соответствует
// organizationId пользователя. Если нет — редирект на /login (мы не должны
// случайно работать с чужой организацией, даже если cookie каким-то образом
// прошёл на чужой поддомен).
//
// Дедупликация: в одном RSC-render layout + page + sub-RSC часто вызывают
// requireOrgAccess независимо. cache() из react деупликат внутри request lifecycle.
export const requireOrgAccess = cache(async (): Promise<OrgContext> => {
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

  // Приостановленная организация полностью блокируется для клиентов
  // (раньше suspend блокировал только записи, но не доступ к /admin).
  // Платформенному админу оставляем доступ для поддержки/диагностики.
  if (org?.isSuspended && !isPlatformOwner) {
    // Владельца уводим на страницу продления (а не /login): теперь suspended-
    // владелец МОЖЕТ залогиниться (см. auth.ts / AUDIT_2026-05-29, D), и редирект
    // на /login создал бы петлю. /admin/subscription использует
    // requireOrgAccessAllowSuspended и рендерится. Остальные роли при suspend
    // не логинятся; их живые сессии — на /login, как раньше (без петли через
    // admin-layout → /cabinet).
    if (session.user.role === "OWNER") redirect("/admin/subscription")
    redirect("/login")
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

  const imp = await getValidatedImpersonateForUser(session.user)

  return {
    orgId: orgId!,
    userId: imp?.actAsUserId ?? session.user.id,
    isPlatformOwner,
    isImpersonating: !!imp,
    hostSlug,
  }
})

export async function requirePlatformOwner() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.isPlatformOwner) redirect("/admin")
  return { userId: session.user.id }
}

/**
 * Аналог requireOrgAccess, но НЕ блокирует suspended-организации.
 * Используется ТОЛЬКО для страниц, которые должны быть доступны
 * приостановленному клиенту: /admin/subscription (оплата продления)
 * и /admin/profile (контакты / реквизиты).
 *
 * Возвращает то же что requireOrgAccess + флаг isSuspended.
 */
export async function requireOrgAccessAllowSuspended(): Promise<OrgContext & { isSuspended: boolean }> {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const orgId = await getCurrentOrgId()
  const isPlatformOwner = session.user.isPlatformOwner ?? false

  if (!orgId) {
    if (isPlatformOwner) redirect("/superadmin")
    else redirect("/login")
  }

  const org = await db.organization.findUnique({
    where: { id: orgId! },
    select: { id: true, slug: true, isActive: true, isSuspended: true },
  }).catch(() => null)

  // Полностью деактивированную (isActive=false) всё равно блокируем — это
  // удаление аккаунта, не приостановка за неуплату.
  if (!org || !org.isActive) {
    if (isPlatformOwner) redirect("/superadmin")
    else redirect("/login")
  }

  const imp = isPlatformOwner ? await getValidatedImpersonateData() : null
  const hostSlug = await getHostSlug()

  return {
    orgId: orgId!,
    userId: imp?.actAsUserId ?? session.user.id,
    isPlatformOwner,
    isImpersonating: !!imp,
    hostSlug,
    isSuspended: !!org?.isSuspended,
  }
}

// Impersonate cookie helpers
export async function getImpersonateData(): Promise<ImpersonateData | null> {
  const store = await cookies()
  const raw = store.get(IMPERSONATE_COOKIE)?.value
  if (!raw) return null
  return decodeImpersonateCookie(raw)
}

export async function getValidatedImpersonateData(): Promise<ImpersonateData | null> {
  const session = await auth()
  if (!session?.user) return null
  return getValidatedImpersonateForUser(session.user)
}

async function getValidatedImpersonateForUser(user: SessionUserForImpersonate): Promise<ImpersonateData | null> {
  if (!user.isPlatformOwner) return null

  const imp = await getImpersonateData()
  if (!imp || imp.realUserId !== user.id) return null

  const startedAt = Number(imp.startedAt)
  if (!Number.isFinite(startedAt) || Date.now() - startedAt > IMPERSONATE_MAX_AGE_SECONDS * 1000) {
    return null
  }

  const actAsUser = await db.user.findUnique({
    where: { id: imp.actAsUserId },
    select: { organizationId: true, isActive: true },
  })
  if (!actAsUser?.isActive || actAsUser.organizationId !== imp.orgId) return null

  return imp
}

function decodeImpersonateCookie(raw: string): ImpersonateData | null {
  const [payload, signature] = raw.split(".")
  if (!payload || !signature) return null

  let expected: string
  try {
    expected = signImpersonatePayload(payload)
  } catch {
    return null
  }
  if (!safeEqual(signature, expected)) return null

  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8")
    const data = JSON.parse(decoded) as Partial<ImpersonateData>
    if (
      typeof data.actAsUserId !== "string"
      || typeof data.realUserId !== "string"
      || typeof data.orgId !== "string"
      || typeof data.startedAt !== "number"
    ) {
      return null
    }
    return data as ImpersonateData
  } catch {
    return null
  }
}

function encodeImpersonateCookie(data: ImpersonateData): string {
  const payload = Buffer.from(JSON.stringify(data), "utf8").toString("base64url")
  return `${payload}.${signImpersonatePayload(payload)}`
}

function signImpersonatePayload(payload: string): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is required for impersonation")
  return createHmac("sha256", secret).update(payload).digest("base64url")
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export async function setImpersonateData(data: ImpersonateData) {
  const store = await cookies()
  store.set(IMPERSONATE_COOKIE, encodeImpersonateCookie(data), {
    maxAge: IMPERSONATE_MAX_AGE_SECONDS,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...(PLATFORM_COOKIE_DOMAIN ? { domain: PLATFORM_COOKIE_DOMAIN } : {}),
  })
}

export async function clearImpersonate() {
  const store = await cookies()
  store.delete({ name: IMPERSONATE_COOKIE, path: "/", ...(PLATFORM_COOKIE_DOMAIN ? { domain: PLATFORM_COOKIE_DOMAIN } : {}) })
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

  const planMax = org.plan[`max${capitalize(type)}` as keyof typeof org.plan] as number | null
  if (planMax === null || planMax === undefined) return // безлимит

  // Активные аддоны увеличивают лимит. Например, +1 здание купили → maxBuildings + 1.
  const { getActiveAddons, effectiveLimit } = await import("@/lib/effective-limits")
  const addons = await getActiveAddons(orgId)
  const max = effectiveLimit(planMax, type === "leads" ? "leads" : type, addons) ?? planMax

  // ВАЖНО: для tenants считаем ТОЛЬКО арендаторов нашей организации, не всю
  // платформу. Раньше при пустом floorIds получался undefined и Prisma считал
  // всех арендаторов всех организаций — это была дыра изоляции.
  let current = 0
  if (type === "buildings") {
    current = await db.building.count({ where: { organizationId: orgId } })
  } else if (type === "tenants") {
    // Тенант принадлежит организации, если его user.organizationId совпадает
    // ИЛИ он привязан к space в одном из наших зданий ИЛИ занимает полный этаж.
    // Скоуп аналогичен tenantScope() из lib/tenant-scope.ts.
    const floorIds = (await db.floor.findMany({
      where: { building: { organizationId: orgId } },
      select: { id: true },
    })).map((f) => f.id)
    const buildingIds = (await db.building.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    })).map((b) => b.id)
    current = await db.tenant.count({
      where: {
        deletedAt: null,
        OR: [
          { user: { organizationId: orgId } },
          ...(floorIds.length > 0 ? [{ space: { floorId: { in: floorIds } } }] : []),
          ...(buildingIds.length > 0 ? [{ fullFloors: { some: { building: { id: { in: buildingIds } } } } }] : []),
        ],
      },
    })
  } else if (type === "users") {
    // Лимит «пользователей» = сотрудники (владелец/админ/бухгалтер/…).
    // Арендаторы сюда НЕ входят — у них собственный лимит max_tenants,
    // иначе каждый заселённый арендатор съедал бы слот сотрудника.
    current = await db.user.count({
      where: { organizationId: orgId, isActive: true, role: { not: "TENANT" } },
    })
  } else if (type === "leads") {
    current = await db.lead.count({
      where: { buildingId: { in: await orgBuildingIds(orgId) } },
    }).catch(() => 0)
  }

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
