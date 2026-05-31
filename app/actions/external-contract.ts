"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { storeUploadedFile, TENANT_DOCUMENT_MAX_BYTES } from "@/lib/storage"

// Внешний договор: контрагент (вышки Beeline/Altel, камеры Сергек) не принимает
// нашу редакцию — у него свой подписанный договор. Заводим запись Contract типа
// EXTERNAL со статусом SIGNED (заключён офлайн) и прикладываем загруженный PDF.
// Конструктор и ЭЦП тут не участвуют.

const EXTERNAL_CONTRACT_MIME = new Set(["application/pdf"])

export async function createExternalContract(formData: FormData) {
  const session = await requireCapabilityAndFeature("documents.uploadTemplate")
  const { orgId } = await requireOrgAccess()

  const tenantId = String(formData.get("tenantId") ?? "").trim()
  if (!tenantId) throw new Error("Не указан арендатор")
  await assertTenantInOrg(tenantId, orgId)

  const number = String(formData.get("number") ?? "").trim()
  if (!number) throw new Error("Укажите номер договора")
  const startRaw = String(formData.get("startDate") ?? "").trim()
  const endRaw = String(formData.get("endDate") ?? "").trim()
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) throw new Error("Прикрепите PDF договора")

  // Здание для области видимости файла: прямое (крышные) или через помещение.
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      buildingId: true,
      space: { select: { floor: { select: { buildingId: true } } } },
    },
  })
  const buildingId = tenant?.buildingId ?? tenant?.space?.floor.buildingId ?? null

  const stored = await storeUploadedFile({
    organizationId: orgId,
    file,
    ownerType: "CONTRACT",
    ownerId: tenantId,
    tenantId,
    buildingId,
    category: "CONTRACT",
    visibility: "TENANT_VISIBLE",
    uploadedById: session.id,
    maxBytes: TENANT_DOCUMENT_MAX_BYTES,
    allowedMimeTypes: EXTERNAL_CONTRACT_MIME,
  })

  const now = new Date()
  const contract = await db.contract.create({
    data: {
      tenantId,
      number,
      type: "EXTERNAL",
      // Договор контрагента (редакция не наша) — текст не храним, только PDF.
      content: "Внешний договор контрагента (PDF приложен).",
      status: "SIGNED",
      signedAt: startRaw ? new Date(startRaw) : now,
      signedByLandlordAt: now,
      startDate: startRaw ? new Date(startRaw) : null,
      endDate: endRaw ? new Date(endRaw) : null,
      attachmentFileId: stored.id,
    },
    select: { id: true },
  })

  revalidatePath("/admin/documents")
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true, contractId: contract.id }
}
