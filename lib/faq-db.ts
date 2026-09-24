import { db } from "@/lib/db"
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/config"
import type { FaqAudience, FaqItem } from "@/lib/faq-types"

const AUDIENCES: FaqAudience[] = ["owner", "admin", "tenant"]

/**
 * Язык, из которого берём статью, если на нужном её ещё нет. Перевод справки
 * идёт постепенно, и показать статью на другом языке лучше, чем пустой список.
 */
const FALLBACK_LOCALE: Record<Locale, Locale> = { kk: "ru", ru: "kk" }

export type FaqArticleForAdmin = FaqItem & {
  slug: string
  locale: Locale
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

type FaqArticleRow = {
  id: string
  slug: string
  locale: string
  audience: string
  category: string
  question: string
  answer: string
  steps: string | null
  tags: string | null
  href: string | null
  hrefLabel: string | null
  sortOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export async function getFaqItemsFromDb(
  orgId: string,
  audiences: FaqAudience[],
  locale: Locale = DEFAULT_LOCALE,
): Promise<FaqItem[]> {
  try {
    await ensureOrgFaqDefaults(orgId)
    // Берём сразу оба языка: статья на языке читателя может быть ещё не
    // переведена, и тогда вместо пустого места покажем её на другом языке.
    const rows = await db.faqArticle.findMany({
      where: {
        organizationId: orgId,
        audience: { in: audiences },
        isActive: true,
      },
      orderBy: [
        { audience: "asc" },
        { sortOrder: "asc" },
        { category: "asc" },
        { createdAt: "asc" },
      ],
      select: faqArticleSelect,
    })
    return pickByLocale(rows, locale).map(toFaqItem)
  } catch {
    const { faqItemsFor } = await import("@/lib/faq")
    const allowed = new Set(audiences)
    return faqItemsFor(locale).filter((item) => allowed.has(item.audience))
  }
}

/**
 * Одна статья — одна карточка: если она есть и на языке читателя, и на другом,
 * оставляем ту, что на его языке. Порядок сортировки запроса сохраняется.
 */
function pickByLocale(rows: FaqArticleRow[], locale: Locale): FaqArticleRow[] {
  const bySlug = new Map<string, FaqArticleRow>()
  for (const row of rows) {
    const chosen = bySlug.get(row.slug)
    if (!chosen || (chosen.locale !== locale && row.locale === locale)) bySlug.set(row.slug, row)
  }
  const kept = new Set(bySlug.values())
  return rows.filter((row) => kept.has(row))
}

export async function getFaqArticlesForAdmin(
  orgId: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<FaqArticleForAdmin[]> {
  try {
    await ensureOrgFaqDefaults(orgId)
    // Редактор правит один язык за раз: иначе два варианта одной статьи
    // стояли бы в списке рядом и их путали бы.
    const rows = await db.faqArticle.findMany({
      where: { organizationId: orgId, locale },
      orderBy: [
        { audience: "asc" },
        { sortOrder: "asc" },
        { category: "asc" },
        { createdAt: "asc" },
      ],
      select: faqArticleSelect,
    })
    return rows.map(toFaqArticleForAdmin)
  } catch {
    const { faqItemsFor } = await import("@/lib/faq")
    return faqItemsFor(locale).map((item, index) => ({
      ...item,
      slug: item.id,
      locale,
      sortOrder: index,
      isActive: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }))
  }
}

export async function ensureOrgFaqDefaults(orgId: string) {
  await createMissingFaqDefaults(orgId)
}

/**
 * Кнопка «Вернуть базовые вопросы». Кроме недостающих статей обновляет те,
 * которые администратор ни разу не правил.
 *
 * Зачем: заготовка ссылается на подписи кнопок, а кнопки переименовываются. Без
 * этого исправление в lib/faq.ts достаётся только новым организациям, а те, кто
 * уже работает, навсегда остаются со статьёй, отправляющей их в раздел с другим
 * названием. Правку администратора при этом не затираем — она и есть причина,
 * по которой статья считается «своей».
 */
export async function restoreMissingFaqDefaults(orgId: string) {
  await createMissingFaqDefaults(orgId)
  await refreshUntouchedFaqDefaults(orgId)
}

/**
 * «Не правил» определяем по времени: Prisma ставит createdAt и updatedAt на
 * создании, поэтому у нетронутой строки они различаются лишь микросекундами.
 * Допуск в две секунды — на случай медленного createMany.
 */
const UNTOUCHED_MS = 2_000

async function refreshUntouchedFaqDefaults(orgId: string) {
  const { faqItemsFor } = await import("@/lib/faq")
  const defaults = new Map<string, FaqItem>(
    LOCALES.flatMap((locale) =>
      faqItemsFor(locale).map((item) => [`${locale}:${item.id}`, item] as [string, FaqItem]),
    ),
  )
  if (defaults.size === 0) return

  const rows = await db.faqArticle.findMany({
    where: { organizationId: orgId, slug: { in: [...new Set([...defaults.values()].map((i) => i.id))] } },
    select: { id: true, slug: true, locale: true, createdAt: true, updatedAt: true },
  })

  for (const row of rows) {
    if (row.updatedAt.getTime() - row.createdAt.getTime() > UNTOUCHED_MS) continue
    const item = defaults.get(`${row.locale}:${row.slug}`)
    if (!item) continue
    await db.faqArticle.update({
      where: { id: row.id },
      data: {
        audience: item.audience,
        category: item.category,
        question: item.question,
        answer: item.answer,
        steps: serializeList(item.steps),
        tags: serializeList(item.tags),
        href: item.href ?? null,
        hrefLabel: item.hrefLabel ?? null,
      },
    })
  }
}

async function createMissingFaqDefaults(orgId: string) {
  const { faqItemsFor } = await import("@/lib/faq")
  const existing = await db.faqArticle.findMany({
    where: { organizationId: orgId },
    select: { slug: true, locale: true },
  })
  const have = new Set(existing.map((row) => `${row.locale}:${row.slug}`))

  // Заготовка заводится на каждом языке, для которого она есть. Перевод справки
  // идёт постепенно: чего нет — не создаём, читатель увидит статью на другом
  // языке (см. pickByLocale).
  const data = LOCALES.flatMap((locale) =>
    faqItemsFor(locale)
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !have.has(`${locale}:${item.id}`))
      .map(({ item, index }) => ({
        organizationId: orgId,
        slug: item.id,
        locale,
        audience: item.audience,
        category: item.category,
        question: item.question,
        answer: item.answer,
        steps: serializeList(item.steps),
        tags: serializeList(item.tags),
        href: item.href ?? null,
        hrefLabel: item.hrefLabel ?? null,
        sortOrder: index,
        isActive: true,
      })),
  )

  if (data.length === 0) return

  await db.faqArticle.createMany({ data, skipDuplicates: true })
}

export function isFaqAudience(value: string): value is FaqAudience {
  return AUDIENCES.includes(value as FaqAudience)
}

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

/** Язык статьи из формы редактора; неизвестный — язык по умолчанию. */
export function faqLocaleFromInput(value: string | null | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE
}

/** Язык, на который откатываемся, если статьи на нужном ещё нет. */
export function faqFallbackLocale(locale: Locale): Locale {
  return FALLBACK_LOCALE[locale]
}

export function serializeFaqList(value: string | null | undefined) {
  const lines = parseFaqTags(value)
  return lines.length > 0 ? lines.join("\n") : null
}

export function serializeFaqSteps(value: string | null | undefined) {
  const lines = parseFaqSteps(value)
  return lines.length > 0 ? lines.join("\n") : null
}

export function parseFaqSteps(value: string | null | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function parseFaqTags(value: string | null | undefined) {
  return (value ?? "")
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function serializeList(value: string[] | undefined) {
  return value && value.length > 0 ? value.join("\n") : null
}

function toFaqItem(row: FaqArticleRow): FaqItem {
  return {
    id: row.id,
    audience: row.audience as FaqAudience,
    category: row.category,
    question: row.question,
    answer: row.answer,
    steps: parseFaqSteps(row.steps),
    tags: parseFaqTags(row.tags),
    href: row.href ?? undefined,
    hrefLabel: row.hrefLabel ?? undefined,
  }
}

function toFaqArticleForAdmin(row: FaqArticleRow): FaqArticleForAdmin {
  return {
    ...toFaqItem(row),
    slug: row.slug,
    locale: isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const faqArticleSelect = {
  id: true,
  slug: true,
  locale: true,
  audience: true,
  category: true,
  question: true,
  answer: true,
  steps: true,
  tags: true,
  href: true,
  hrefLabel: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const
