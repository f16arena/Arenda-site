"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { requireAdmin } from "@/lib/permissions"
import {
  detectFormat,
  extractDocxPlaceholders,
  extractXlsxPlaceholders,
  type DocumentType,
} from "@/lib/template-engine"

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export interface UploadTemplateResult {
  ok: boolean
  error?: string
  templateId?: string
  format?: string
  detectedPlaceholders?: string[]
  warning?: string
}

/**
 * Загружает кастомный шаблон документа.
 * Деактивирует предыдущий шаблон того же типа (но не удаляет — для истории).
 */
export async function uploadDocumentTemplate(documentType: DocumentType, formData: FormData): Promise<UploadTemplateResult> {
  await requireAdmin()
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
      warning = "В шаблоне не найдено placeholder'ов вида {tenant_name}. Документ будет вставлен как есть, без подстановки данных."
    }
  } else if (format === "XLSX") {
    detectedPlaceholders = await extractXlsxPlaceholders(buffer)
    if (detectedPlaceholders.length === 0) {
      warning = "В шаблоне не найдено placeholder'ов вида {tenant_name} в ячейках. Документ будет вставлен как есть."
    }
  } else if (format === "PDF") {
    warning = "PDF используется только как образец-превью. Для автоматической генерации данных загрузите DOCX или XLSX."
  }

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

  revalidatePath(`/admin/documents/templates/${slugForType(documentType)}`)

  return {
    ok: true,
    templateId: tpl.id,
    format,
    detectedPlaceholders,
    warning,
  }
}

export async function removeDocumentTemplate(documentType: DocumentType): Promise<{ ok: boolean }> {
  await requireAdmin()
  const { orgId } = await requireOrgAccess()
  await db.documentTemplate.updateMany({
    where: { organizationId: orgId, documentType, isActive: true },
    data: { isActive: false },
  })
  revalidatePath(`/admin/documents/templates/${slugForType(documentType)}`)
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
