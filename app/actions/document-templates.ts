"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { requireSection } from "@/lib/acl"
import {
  detectFormat,
  extractDocxPlaceholders,
  extractXlsxPlaceholders,
  PLACEHOLDER_DOCS,
  type DocumentType,
} from "@/lib/template-engine"

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export interface UploadTemplateResult {
  ok: boolean
  error?: string
  templateId?: string
  format?: string
  detectedPlaceholders?: string[]
  /** Метки, которые система знает и заполнит при генерации */
  recognizedPlaceholders?: { key: string; label: string }[]
  /** Метки в шаблоне, которые система не знает — останутся пустыми */
  unknownPlaceholders?: string[]
  /** Важные метки, которые НЕ использованы в шаблоне (рекомендуем добавить) */
  missingRecommended?: { key: string; label: string }[]
  warning?: string
}

/**
 * Загружает кастомный шаблон документа.
 * Деактивирует предыдущий шаблон того же типа (но не удаляет — для истории).
 */
export async function uploadDocumentTemplate(documentType: DocumentType, formData: FormData): Promise<UploadTemplateResult> {
  await requireSection("documents", "edit")
  const session = await auth()
  const { orgId } = await requireOrgAccess()

  const file = formData.get("file")
  if (!file || !(file instanceof File)) return { ok: false, error: "Файл не передан" }
  if (file.size > MAX_SIZE) return { ok: false, error: "Размер файла превышает 10 МБ" }
  if (file.size === 0) return { ok: false, error: "Файл пустой" }

  const format = detectFormat(file.name, file.type)
  if (!format) return { ok: false, error: "Неподдерживаемый формат. Загрузите DOCX, XLSX или PDF." }

  const buffer = Buffer.from(await file.arrayBuffer())
  let detectedPlaceholders: string[] = []
  let warning: string | undefined

  if (format === "DOCX") {
    detectedPlaceholders = extractDocxPlaceholders(buffer)
    if (detectedPlaceholders.length === 0) {
      warning = "Шаблон сохранён, но в DOCX не найдены метки вида {tenant_name}. Система будет скачивать именно этот файл как статичный шаблон. Чтобы договор заполнялся автоматически, добавьте нужные метки и загрузите новую версию."
    }
  } else if (format === "XLSX") {
    detectedPlaceholders = await extractXlsxPlaceholders(buffer)
    if (detectedPlaceholders.length === 0) {
      warning = "Шаблон сохранён, но в XLSX не найдены метки вида {tenant_name}. Файл будет использоваться как статичный шаблон без автоподстановки данных."
    }
  } else if (format === "PDF") {
    warning = "PDF используется только как образец-превью. Для автоматической генерации данных загрузите DOCX или XLSX."
  }

  // Сверяем найденные метки со списком известных системе плейсхолдеров
  const known = PLACEHOLDER_DOCS[documentType]
  const knownKeys = new Map(known.map((p) => [p.key, p.label]))
  const recognizedPlaceholders: { key: string; label: string }[] = []
  const unknownPlaceholders: string[] = []
  for (const p of detectedPlaceholders) {
    // Поддержка вложенных вроде items.amount — берём корень
    const root = p.split(".")[0]
    const label = knownKeys.get(p) ?? knownKeys.get(root)
    if (label) {
      recognizedPlaceholders.push({ key: p, label })
    } else {
      unknownPlaceholders.push(p)
    }
  }
  // Важные ключевые метки, без которых документ обычно теряет смысл
  const RECOMMENDED_KEYS: Record<DocumentType, string[]> = {
    CONTRACT: ["tenant_name", "tenant_basis", "rent_clause", "prolongation_clause", "esf_clause", "space_number", "start_date", "end_date"],
    INVOICE: ["tenant_name", "total", "period", "invoice_number"],
    ACT: ["tenant_name", "total", "act_number", "period_start", "period_end"],
    RECONCILIATION: ["tenant_name", "balance", "period_start", "period_end"],
  }
  const usedKeys = new Set(detectedPlaceholders)
  const missingRecommended = RECOMMENDED_KEYS[documentType]
    .filter((k) => !usedKeys.has(k))
    .map((k) => ({ key: k, label: knownKeys.get(k) ?? k }))

  // Деактивируем предыдущий шаблон того же типа
  await db.documentTemplate.updateMany({
    where: { organizationId: orgId, documentType, isActive: true },
    data: { isActive: false },
  })

  const tpl = await db.documentTemplate.create({
    data: {
      organizationId: orgId,
      documentType,
      format,
      fileName: file.name,
      fileBytes: buffer,
      fileSize: file.size,
      isActive: true,
      uploadedById: session?.user?.id,
    },
    select: { id: true },
  })

  revalidateTemplatePaths(documentType)

  return {
    ok: true,
    templateId: tpl.id,
    format,
    detectedPlaceholders,
    recognizedPlaceholders,
    unknownPlaceholders,
    missingRecommended,
    warning,
  }
}

export async function removeDocumentTemplate(documentType: DocumentType): Promise<{ ok: boolean }> {
  await requireSection("documents", "edit")
  const { orgId } = await requireOrgAccess()
  await db.documentTemplate.updateMany({
    where: { organizationId: orgId, documentType, isActive: true },
    data: { isActive: false },
  })
  revalidateTemplatePaths(documentType)
  return { ok: true }
}

export interface ActiveTemplateInfo {
  id: string
  format: string
  fileName: string
  fileSize: number
  uploadedAt: Date
}

export async function getActiveTemplate(documentType: DocumentType): Promise<ActiveTemplateInfo | null> {
  const { orgId } = await requireOrgAccess()
  const tpl = await db.documentTemplate.findFirst({
    where: { organizationId: orgId, documentType, isActive: true },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, format: true, fileName: true, fileSize: true, uploadedAt: true },
  })
  return tpl
}

function slugForType(t: DocumentType): string {
  switch (t) {
    case "CONTRACT": return "rental"
    case "INVOICE": return "invoice"
    case "ACT": return "act"
    case "RECONCILIATION": return "reconciliation"
  }
}

function createPathForType(t: DocumentType): string {
  switch (t) {
    case "CONTRACT": return "contract"
    case "INVOICE": return "invoice"
    case "ACT": return "act"
    case "RECONCILIATION": return "reconciliation"
  }
}

function revalidateTemplatePaths(documentType: DocumentType) {
  revalidatePath("/admin/settings/document-templates")
  revalidatePath(`/admin/documents/new/${createPathForType(documentType)}`)
  revalidatePath(`/admin/documents/templates/${slugForType(documentType)}`)
}
