"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { requireOrgAccess } from "@/lib/org"
import {
  isFaqAudience,
  restoreMissingFaqDefaults,
  serializeFaqList,
  serializeFaqSteps,
} from "@/lib/faq-db"

export async function saveFaqArticle(formData: FormData) {
  await requireCapabilityAndFeature("faq.manage")
  const { orgId } = await requireOrgAccess()

  const id = readString(formData, "id")
  const audience = readString(formData, "audience")
  const category = readString(formData, "category")
  const question = readString(formData, "question")
  const answer = readString(formData, "answer")
  const href = readString(formData, "href")
  const hrefLabel = readString(formData, "hrefLabel")
  const sortOrder = Number(readString(formData, "sortOrder") || "0")
  const isActive = formData.get("isActive") === "on"

  if (!isFaqAudience(audience)) throw new Error("Некорректная аудитория FAQ")
  if (!category || !question || !answer) throw new Error("Заполните раздел, вопрос и ответ")

  const data = {
    audience,
    category,
    question,
    answer,
    steps: serializeFaqSteps(readString(formData, "steps")),
    tags: serializeFaqList(readString(formData, "tags")),
    href: href || null,
    hrefLabel: hrefLabel || null,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    isActive,
  }

  if (id) {
    const existing = await db.faqArticle.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    })
    if (!existing) throw new Error("FAQ-запись не найдена")
    await db.faqArticle.update({ where: { id }, data })
  } else {
    await db.faqArticle.create({
      data: {
        ...data,
        organizationId: orgId,
        slug: makeFaqSlug(question),
      },
    })
  }

  revalidateFaq()
}

export async function archiveFaqArticle(formData: FormData) {
  await requireCapabilityAndFeature("faq.manage")
  const { orgId } = await requireOrgAccess()
  const id = readString(formData, "id")
  if (!id) throw new Error("FAQ-запись не передана")

  await db.faqArticle.updateMany({
    where: { id, organizationId: orgId },
    data: { isActive: false },
  })

  revalidateFaq()
}

export async function restoreDefaultFaqArticles() {
  await requireCapabilityAndFeature("faq.manage")
  const { orgId } = await requireOrgAccess()
  await restoreMissingFaqDefaults(orgId)
  revalidateFaq()
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function makeFaqSlug(question: string) {
  const base = question
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  const suffix = Date.now().toString(36)
  return `${base || "faq"}-${suffix}`
}

function revalidateFaq() {
  revalidatePath("/admin/faq")
  revalidatePath("/cabinet/faq")
}
