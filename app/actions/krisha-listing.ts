"use server"

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { spaceScope } from "@/lib/tenant-scope"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { parseSpacePhotos } from "@/lib/space-photos"
import { getCityMedianPerSqm } from "@/lib/market"
import { buildListingContent, KRISHA_CREATE_URL } from "@/lib/krisha-listing"

async function assertCanEditSpaces(orgId: string, userId: string, role: string, isPlatformOwner: boolean) {
  if (role === "OWNER" || isPlatformOwner) return
  const caps = new Set(await getAllowedCapabilityKeysForUser({ userId, role, isPlatformOwner, orgId }))
  if (!caps.has("spaces.edit")) throw new Error("Нет прав на размещение объявлений")
}

const LISTING_STATUSES = new Set(["DRAFT", "COPIED", "PUBLISHED", "ARCHIVED"])

export type GeneratedListing = {
  ok: true
  draftId: string
  title: string
  description: string
  priceMonthly: number | null
  pricePerSqm: number | null
  marketPerSqm: number | null
  status: string
  photos: string[]
  krishaUrl: string
}

/**
 * Сгенерировать (или обновить) черновик объявления для помещения и подготовить к
 * публикации на krisha (полуавтомат). Возвращает текст, цену-подсказку и фото.
 */
export async function generateListingDraft(
  spaceId: string,
): Promise<GeneratedListing | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()
  if (!orgId) return { ok: false, error: "Организация не определена" }
  try {
    await assertCanEditSpaces(orgId, session.user.id, session.user.role, session.user.isPlatformOwner ?? false)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Нет прав" }
  }

  const space = await db.space.findFirst({
    where: { AND: [spaceScope(orgId), { id: spaceId }] },
    select: {
      id: true,
      number: true,
      area: true,
      description: true,
      photos: true,
      floor: {
        select: {
          name: true,
          ratePerSqm: true,
          building: {
            select: { id: true, name: true, address: true, addressCity: true, phone: true, organizationId: true },
          },
        },
      },
    },
  })
  if (!space) return { ok: false, error: "Помещение не найдено" }

  const building = space.floor.building
  // Рыночная подсказка (если сборщик собрал данные по городу).
  let marketPerSqm: number | null = null
  try {
    marketPerSqm = await getCityMedianPerSqm([building.id])
  } catch {
    marketPerSqm = null
  }

  // Цена: ставка владельца (₸/м² этажа) приоритетна; иначе рынок.
  const ownerRate = space.floor.ratePerSqm && space.floor.ratePerSqm > 0 ? Math.round(space.floor.ratePerSqm) : null
  const pricePerSqm = ownerRate ?? marketPerSqm
  const priceMonthly = pricePerSqm ? Math.round(pricePerSqm * space.area) : null

  const { title, description } = buildListingContent({
    number: space.number,
    area: space.area,
    floorName: space.floor.name,
    buildingName: building.name,
    address: building.address,
    city: building.addressCity,
    description: space.description,
    priceMonthly,
    pricePerSqm,
    marketPerSqm,
    phone: building.phone,
  })

  // Один активный черновик на помещение: обновляем существующий (DRAFT/COPIED), иначе создаём.
  const existing = await db.listingDraft.findFirst({
    where: { organizationId: orgId, spaceId: space.id, status: { in: ["DRAFT", "COPIED"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  })

  const draft = existing
    ? await db.listingDraft.update({
        where: { id: existing.id },
        data: { title, description, priceMonthly, pricePerSqm, status: "DRAFT" },
        select: { id: true, status: true },
      })
    : await db.listingDraft.create({
        data: {
          organizationId: orgId,
          buildingId: building.id,
          spaceId: space.id,
          target: "krisha",
          title,
          description,
          priceMonthly,
          pricePerSqm,
          status: "DRAFT",
          createdById: session.user.id,
        },
        select: { id: true, status: true },
      })

  return {
    ok: true,
    draftId: draft.id,
    title,
    description,
    priceMonthly,
    pricePerSqm,
    marketPerSqm,
    status: draft.status,
    photos: parseSpacePhotos(space.photos),
    krishaUrl: KRISHA_CREATE_URL,
  }
}

/**
 * Отметить статус черновика (например, COPIED при открытии формы krisha или
 * PUBLISHED со ссылкой на размещённое объявление).
 */
export async function setListingStatus(
  draftId: string,
  status: string,
  externalUrl?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()
  if (!orgId) return { ok: false, error: "Организация не определена" }
  if (!LISTING_STATUSES.has(status)) return { ok: false, error: "Неизвестный статус" }
  try {
    await assertCanEditSpaces(orgId, session.user.id, session.user.role, session.user.isPlatformOwner ?? false)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Нет прав" }
  }

  const draft = await db.listingDraft.findFirst({ where: { id: draftId, organizationId: orgId }, select: { id: true } })
  if (!draft) return { ok: false, error: "Черновик не найден" }

  const url = externalUrl?.trim()
  await db.listingDraft.update({
    where: { id: draft.id },
    data: { status, externalUrl: url && /^https?:\/\//.test(url) ? url.slice(0, 500) : undefined },
  })
  revalidatePath("/admin/spaces")
  revalidatePath("/admin/listings")
  return { ok: true }
}

export type ListingRow = {
  id: string
  title: string
  status: string
  target: string
  priceMonthly: number | null
  externalUrl: string | null
  updatedAt: string
  spaceNumber: string | null
  buildingName: string | null
}

/** Список черновиков/объявлений организации (для /admin/listings). */
export async function listListingDrafts(): Promise<ListingRow[]> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") return []
  const { orgId } = await requireOrgAccess()
  if (!orgId) return []

  const drafts = await db.listingDraft.findMany({
    where: { organizationId: orgId },
    orderBy: { updatedAt: "desc" },
    take: 120,
    select: { id: true, title: true, status: true, target: true, priceMonthly: true, externalUrl: true, updatedAt: true, spaceId: true },
  })
  const spaceIds = [...new Set(drafts.map((d) => d.spaceId))]
  const spaces = spaceIds.length
    ? await db.space.findMany({
        where: { AND: [spaceScope(orgId), { id: { in: spaceIds } }] },
        select: { id: true, number: true, floor: { select: { building: { select: { name: true } } } } },
      })
    : []
  const byId = new Map(spaces.map((s) => [s.id, s]))

  return drafts.map((d) => {
    const sp = byId.get(d.spaceId)
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      target: d.target,
      priceMonthly: d.priceMonthly,
      externalUrl: d.externalUrl,
      updatedAt: d.updatedAt.toISOString(),
      spaceNumber: sp?.number ?? null,
      buildingName: sp?.floor.building.name ?? null,
    }
  })
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * XML-фид вакантных помещений организации (универсальный формат). Готов как старт
 * для партнёрского импорта (krisha и др.) — точную схему адаптируем под площадку.
 * Фото в фид не включаем: они хранятся как data-URL в БД, фиду нужны публичные URL.
 */
export async function buildVacancyFeedXml(): Promise<{ ok: true; xml: string; count: number } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()
  if (!orgId) return { ok: false, error: "Организация не определена" }

  const spaces = await db.space.findMany({
    where: { AND: [spaceScope(orgId), { status: "VACANT", kind: "RENTABLE", tenant: { is: null } }] },
    select: {
      id: true,
      number: true,
      area: true,
      description: true,
      floor: {
        select: { name: true, ratePerSqm: true, building: { select: { name: true, address: true, addressCity: true, phone: true } } },
      },
    },
  })

  const offers = spaces
    .map((s) => {
      const b = s.floor.building
      const perSqm = s.floor.ratePerSqm && s.floor.ratePerSqm > 0 ? Math.round(s.floor.ratePerSqm) : null
      const price = perSqm ? Math.round(perSqm * s.area) : null
      return [
        `  <offer id="${xmlEscape(s.id)}">`,
        `    <type>commercial-rent</type>`,
        b.name ? `    <building>${xmlEscape(b.name)}</building>` : "",
        b.addressCity ? `    <city>${xmlEscape(b.addressCity)}</city>` : "",
        b.address ? `    <address>${xmlEscape(b.address)}</address>` : "",
        `    <room>${xmlEscape(s.number)}</room>`,
        `    <area unit="sqm">${s.area}</area>`,
        price ? `    <price currency="KZT" period="month">${price}</price>` : "",
        perSqm ? `    <pricePerSqm currency="KZT">${perSqm}</pricePerSqm>` : "",
        s.description ? `    <description>${xmlEscape(s.description)}</description>` : "",
        b.phone ? `    <phone>${xmlEscape(b.phone)}</phone>` : "",
        `  </offer>`,
      ]
        .filter(Boolean)
        .join("\n")
    })
    .join("\n")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<vacancies>\n${offers}\n</vacancies>\n`
  return { ok: true, xml, count: spaces.length }
}
