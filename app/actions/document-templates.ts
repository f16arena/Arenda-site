"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import {
  detectFormat,
  extractDocxPlaceholders,
  extractXlsxPlaceholders,
  PLACEHOLDER_DOCS,
  type DocumentType,
} from "@/lib/template-engine"
import { isContractPlacementType } from "@/lib/contract-placement-types"

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

/**
 * Тип договора по предмету аренды (PREMISES/ROOF/…) применим ТОЛЬКО к CONTRACT.
 * Для прочих документов и для «общего» шаблона договора → null.
 */
function normalizePlacementType(documentType: DocumentType, raw: FormDataEntryValue | string | null): string | null {
  if (documentType !== "CONTRACT") return null
  const v = String(raw ?? "").trim()
  return isContractPlacementType(v) ? v : null
}

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
  await requireCapabilityAndFeature("documents.uploadTemplate")
  const session = await auth()
  const { orgId } = await requireOrgAccess()

  const file = formData.get("file")
  if (!file || !(file instanceof File)) return { ok: false, error: "Файл не передан" }
  if (file.size > MAX_SIZE) return { ok: false, error: "Размер файла превышает 10 МБ" }
  if (file.size === 0) return { ok: false, error: "Файл пустой" }

  // Тип договора (для CONTRACT): свой шаблон под помещение/крышу/территорию/… .
  const placementType = normalizePlacementType(documentType, formData.get("placementType"))

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

  // Деактивируем предыдущий шаблон того же типа И того же предмета аренды
  // (placementType). Для прочих документов placementType=null — поведение прежнее.
  await db.documentTemplate.updateMany({
    where: { organizationId: orgId, documentType, isActive: true, placementType },
    data: { isActive: false },
  })

  const tpl = await db.documentTemplate.create({
    data: {
      organizationId: orgId,
      documentType,
      placementType,
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

export async function removeDocumentTemplate(
  documentType: DocumentType,
  placementTypeRaw?: string | null,
): Promise<{ ok: boolean }> {
  await requireCapabilityAndFeature("documents.uploadTemplate")
  const { orgId } = await requireOrgAccess()
  const placementType = normalizePlacementType(documentType, placementTypeRaw ?? null)
  await db.documentTemplate.updateMany({
    where: { organizationId: orgId, documentType, isActive: true, placementType },
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

export async function getActiveTemplate(
  documentType: DocumentType,
  placementTypeRaw?: string | null,
): Promise<ActiveTemplateInfo | null> {
  const { orgId } = await requireOrgAccess()
  const placementType = normalizePlacementType(documentType, placementTypeRaw ?? null)
  const tpl = await db.documentTemplate.findFirst({
    where: { organizationId: orgId, documentType, isActive: true, placementType },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, format: true, fileName: true, fileSize: true, uploadedAt: true },
  })
  return tpl
}

/**
 * Активные шаблоны договора по типам предмета аренды: ключ "" — общий шаблон,
 * иначе placementType (PREMISES/ROOF/…). Для UI «Настройки → Шаблоны».
 */
export async function getActiveContractTemplates(): Promise<Record<string, ActiveTemplateInfo>> {
  const { orgId } = await requireOrgAccess()
  const rows = await db.documentTemplate.findMany({
    where: { organizationId: orgId, documentType: "CONTRACT", isActive: true },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, format: true, fileName: true, fileSize: true, uploadedAt: true, placementType: true },
  })
  const map: Record<string, ActiveTemplateInfo> = {}
  for (const r of rows) {
    const key = r.placementType ?? ""
    if (!map[key]) map[key] = { id: r.id, format: r.format, fileName: r.fileName, fileSize: r.fileSize, uploadedAt: r.uploadedAt }
  }
  return map
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
