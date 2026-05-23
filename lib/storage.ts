import { createHash } from "node:crypto"
import { gzipSync, gunzipSync } from "node:zlib"
import { db } from "@/lib/db"

export const TENANT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const PAYMENT_RECEIPT_MAX_BYTES = 2 * 1024 * 1024
export const REQUEST_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024

export const TENANT_DOCUMENT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

export const PAYMENT_RECEIPT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
])

export const REQUEST_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
])

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

type StoreUploadedFileInput = {
  organizationId: string
  file: File
  ownerType: string
  ownerId?: string | null
  buildingId?: string | null
  tenantId?: string | null
  category?: string
  visibility?: string
  uploadedById?: string | null
  maxBytes: number
  allowedMimeTypes: Set<string>
}

type StoreBufferInput = {
  organizationId: string
  fileName: string
  mimeType: string
  bytes: Buffer
  ownerType: string
  ownerId?: string | null
  buildingId?: string | null
  tenantId?: string | null
  category?: string
  visibility?: string
  uploadedById?: string | null
  maxBytes: number
  allowedMimeTypes: Set<string>
}

export function storageFileUrl(id: string) {
  return `/api/storage/${id}`
}

export async function storeUploadedFile(input: StoreUploadedFileInput) {
  validateFileSize(input.file.size, input.maxBytes)

  const fileName = sanitizeFileName(input.file.name)
  const extension = getExtension(fileName)
  const mimeType = normalizeMimeType(input.file.type, extension)
  validateMimeType(mimeType, input.allowedMimeTypes)

  const bytes = Buffer.from(await input.file.arrayBuffer())
  return storeBufferFile({
    organizationId: input.organizationId,
    fileName,
    mimeType,
    bytes,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    buildingId: input.buildingId,
    tenantId: input.tenantId,
    category: input.category,
    visibility: input.visibility,
    uploadedById: input.uploadedById,
    maxBytes: input.maxBytes,
    allowedMimeTypes: input.allowedMimeTypes,
  })
}

export async function storeBufferFile(input: StoreBufferInput) {
  validateFileSize(input.bytes.length, input.maxBytes)
  validateMimeType(input.mimeType, input.allowedMimeTypes)
  await assertOrgStorageLimit(input.organizationId, input.bytes.length)

  const fileName = sanitizeFileName(input.fileName)
  const extension = getExtension(fileName)
  const gzipped = gzipSync(input.bytes, { level: 9 })
  const shouldStoreCompressed = gzipped.length < input.bytes.length
  const storedBytes = shouldStoreCompressed ? gzipped : input.bytes
  const storedData = Uint8Array.from(storedBytes)
  const compression = shouldStoreCompressed ? "GZIP" : "NONE"
  const sha256 = createHash("sha256").update(input.bytes).digest("hex")

  const stored = await db.storedFile.create({
    data: {
      organizationId: input.organizationId,
      buildingId: input.buildingId ?? null,
      tenantId: input.tenantId ?? null,
      ownerType: input.ownerType,
      ownerId: input.ownerId ?? null,
      category: input.category ?? input.ownerType,
      visibility: input.visibility ?? "ADMIN_ONLY",
      fileName,
      mimeType: input.mimeType,
      extension,
      originalSize: input.bytes.length,
      compressedSize: storedBytes.length,
      compression,
      sha256,
      data: storedData,
      uploadedById: input.uploadedById ?? null,
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      originalSize: true,
      compressedSize: true,
      compression: true,
    },
  })

  return { ...stored, url: storageFileUrl(stored.id) }
}

export function readStoredFileBytes(file: { data: Uint8Array | Buffer; compression: string }) {
  const data = Buffer.from(file.data)
  if (file.compression === "GZIP") return gunzipSync(data)
  return data
}

export async function getTenantStorageScope(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      space: { select: { floor: { select: { buildingId: true } } } },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { space: { select: { floor: { select: { buildingId: true } } } } },
        take: 1,
      },
      fullFloors: {
        orderBy: { number: "asc" },
        select: { buildingId: true },
        take: 1,
      },
    },
  })

  return {
    tenantId,
    buildingId:
      tenant?.space?.floor.buildingId ??
      tenant?.tenantSpaces[0]?.space.floor.buildingId ??
      tenant?.fullFloors[0]?.buildingId ??
      null,
  }
}

export function formatMaxFileSize(bytes: number) {
  const mb = bytes / 1024 / 1024
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} МБ`
}

function validateFileSize(size: number, maxBytes: number) {
  if (size <= 0) throw new Error("Файл пустой")
  if (size > maxBytes) throw new Error(`Размер файла превышает ${formatMaxFileSize(maxBytes)}`)
}

/**
 * Проверка лимита хранилища тарифа: суммирует originalSize всех StoredFile
 * организации и сравнивает с plan.features.limits.storageGb. Кидает ошибку,
 * если новый файл превысит лимит. Null/отсутствие лимита — безлимит.
 */
export async function assertOrgStorageLimit(organizationId: string, incomingBytes: number) {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { plan: { select: { features: true, maxStorageGb: true } } },
  })
  let limitGb: number | null = org?.plan?.maxStorageGb ?? null
  // Fallback на features.limits.storageGb (старый путь, до выделения колонки).
  if (limitGb == null && org?.plan?.features) {
    try {
      const parsed = JSON.parse(org.plan.features) as { limits?: { storageGb?: number | null } }
      if (typeof parsed?.limits?.storageGb === "number") limitGb = parsed.limits.storageGb
    } catch { /* битый json — считаем безлимит */ }
  }
  if (limitGb == null) return // безлимит

  const limitBytes = limitGb * 1024 * 1024 * 1024
  const agg = await db.storedFile.aggregate({
    where: { organizationId, deletedAt: null },
    _sum: { originalSize: true },
  })
  const usedBytes = agg._sum.originalSize ?? 0
  if (usedBytes + incomingBytes > limitBytes) {
    const usedMb = Math.round(usedBytes / 1024 / 1024)
    throw new Error(
      `Лимит хранилища тарифа исчерпан: использовано ${usedMb} МБ из ${limitGb} ГБ. Перейдите на старший тариф или удалите часть файлов.`,
    )
  }
}

function validateMimeType(mimeType: string, allowedMimeTypes: Set<string>) {
  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error("Недопустимый тип файла")
  }
}

function sanitizeFileName(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()
  return (cleaned || "file").slice(0, 180)
}

function getExtension(fileName: string) {
  const match = /\.([a-z0-9]+)$/i.exec(fileName)
  return match?.[1]?.toLowerCase() ?? null
}

function normalizeMimeType(mimeType: string, extension: string | null) {
  const trimmed = mimeType.trim().toLowerCase()
  if (trimmed && trimmed !== "application/octet-stream") return trimmed
  return extension ? MIME_BY_EXTENSION[extension] ?? "application/octet-stream" : "application/octet-stream"
}
