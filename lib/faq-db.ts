import { db } from "@/lib/db"
import { faqItems, type FaqAudience, type FaqItem } from "@/lib/faq"

const AUDIENCES: FaqAudience[] = ["owner", "admin", "tenant"]

export type FaqArticleForAdmin = FaqItem & {
  slug: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

type FaqArticleRow = {
  id: string
  slug: string
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

export async function getFaqItemsFromDb(orgId: string, audiences: FaqAudience[]): Promise<FaqItem[]> {
  try {
    await ensureOrgFaqDefaults(orgId)
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
    return rows.map(toFaqItem)
  } catch {
    const allowed = new Set(audiences)
    return faqItems.filter((item) => allowed.has(item.audience))
  }
}

export async function getFaqArticlesForAdmin(orgId: string): Promise<FaqArticleForAdmin[]> {
  try {
    await ensureOrgFaqDefaults(orgId)
    const rows = await db.faqArticle.findMany({
      where: { organizationId: orgId },
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
    return faqItems.map((item, index) => ({
      ...item,
      slug: item.id,
      sortOrder: index,
      isActive: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }))
  }
}

export async function ensureOrgFaqDefaults(orgId: string) {
  const count = await db.faqArticle.count({ where: { organizationId: orgId } })
  if (count > 0) return

  await db.faqArticle.createMany({
    data: faqItems.map((item, index) => ({
      organizationId: orgId,
      slug: item.id,
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
    skipDuplicates: true,
  })
}

export async function restoreMissingFaqDefaults(orgId: string) {
  await db.faqArticle.createMany({
    data: faqItems.map((item, index) => ({
      organizationId: orgId,
      slug: item.id,
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
    skipDuplicates: true,
  })
}

export function isFaqAudience(value: string): value is FaqAudience {
  return AUDIENCES.includes(value as FaqAudience)
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
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const faqArticleSelect = {
  id: true,
  slug: true,
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
