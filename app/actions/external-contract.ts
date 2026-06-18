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

// Парсинг условий из формы (мягкий: пустое поле → не трогаем поле карточки).
function parseMoney(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".")
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function createExternalContract(formData: FormData) {
  const session = await requireCapabilityAndFeature("documents.uploadTemplate")
  const { orgId } = await requireOrgAccess()

  const tenantId = String(formData.get("tenantId") ?? "").trim()
  if (!tenantId) throw new Error("Не указан арендатор")
  await assertTenantInOrg(tenantId, orgId)

  const number = String(formData.get("number") ?? "").trim()
  if (!number) throw new Error("Укажите номер договора")
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) throw new Error("Прикрепите PDF договора")

  // Условия договора → пишем в карточку арендатора (их читает биллинг).
  const startDate = parseDate(formData.get("startDate"))
  const endDate = parseDate(formData.get("endDate"))
  if (startDate && endDate && endDate < startDate) {
    throw new Error("Дата окончания раньше даты начала")
  }
  const rentMode = String(formData.get("rentMode") ?? "FIXED").trim()
  const rentAmount = parseMoney(formData.get("rentAmount"))
  const depositAmount = parseMoney(formData.get("depositAmount"))
  const indexationPct = parseMoney(formData.get("indexationPct"))
  const nextIndexationAt = parseDate(formData.get("nextIndexationAt"))
  const serviceFeeExempt = formData.get("serviceFeeExempt") === "on"

  let paymentDueDay: number | null = null
  const dueRaw = String(formData.get("paymentDueDay") ?? "").trim()
  if (dueRaw) {
    const d = Number(dueRaw)
    if (!Number.isInteger(d) || d < 1 || d > 31) throw new Error("День оплаты — число от 1 до 31")
    paymentDueDay = d
  }

  // Сборка обновления карточки: трогаем только заполненные поля.
  const tenantUpdate: Record<string, unknown> = {}
  // Чекбокс аддитивен: отмечен → освобождаем; не трогаем существующее значение,
  // если не отмечен (иначе случайно снимем ранее выставленное освобождение).
  if (serviceFeeExempt) tenantUpdate.serviceFeeExempt = true
  if (startDate) tenantUpdate.contractStart = startDate
  if (endDate) tenantUpdate.contractEnd = endDate
  if (paymentDueDay !== null) tenantUpdate.paymentDueDay = paymentDueDay
  if (depositAmount !== null) tenantUpdate.depositAmount = depositAmount
  if (indexationPct !== null) tenantUpdate.indexationPct = indexationPct
  if (nextIndexationAt) tenantUpdate.nextIndexationAt = nextIndexationAt
  // Аренда: фикс-сумма или ставка×площадь. Выбранный режим обнуляет другой,
  // чтобы не было неоднозначности приоритета в биллинге.
  if (rentAmount !== null) {
    if (rentMode === "RATE") {
      tenantUpdate.customRate = rentAmount
      tenantUpdate.fixedMonthlyRent = null
    } else {
      tenantUpdate.fixedMonthlyRent = rentAmount
      tenantUpdate.customRate = null
    }
  }

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
  const contract = await db.$transaction(async (tx) => {
    const created = await tx.contract.create({
      data: {
        tenantId,
        number,
        type: "EXTERNAL",
        // Договор контрагента (редакция не наша) — текст не храним, только PDF.
        content: "Внешний договор контрагента (PDF приложен).",
        status: "SIGNED",
        signedAt: startDate ?? now,
        signedByLandlordAt: now,
        startDate,
        endDate,
        attachmentFileId: stored.id,
      },
      select: { id: true },
    })
    // Условия → карточка арендатора (источник истины для биллинга).
    await tx.tenant.update({ where: { id: tenantId }, data: tenantUpdate })
    return created
  })

  revalidatePath("/admin/documents")
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true, contractId: contract.id }
}
