"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { storeUploadedFile, TENANT_DOCUMENT_MAX_BYTES } from "@/lib/storage"
import { parseRentSchedule, resolveScheduledRent } from "@/lib/rent"

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

  // Ступенчатая аренда (JSON): [{ from:"YYYY-MM", amount }]. Пусто → не трогаем.
  const rentScheduleSteps = parseRentSchedule(String(formData.get("rentSchedule") ?? ""))

  // Входящий долг — одно начисление-остаток «долг на дату перехода в систему».
  const openingDebt = parseMoney(formData.get("openingDebt"))
  const openingDebtPeriodRaw = String(formData.get("openingDebtPeriod") ?? "").trim()
  const openingDebtDue = parseDate(formData.get("openingDebtDue"))

  let paymentDueDay: number | null = null
  const dueRaw = String(formData.get("paymentDueDay") ?? "").trim()
  if (dueRaw) {
    const d = Number(dueRaw)
    if (!Number.isInteger(d) || d < 1 || d > 31) throw new Error("День оплаты — число от 1 до 31")
    paymentDueDay = d
  }

  // Пеня за просрочку (%/день) — из условий договора (напр. 1% по п.6.1).
  let penaltyPercent: number | null = null
  const penaltyRaw = String(formData.get("penaltyPercent") ?? "").trim()
  if (penaltyRaw) {
    const n = Number(penaltyRaw.replace(",", "."))
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Пеня — число от 0 до 100 (%/день)")
    penaltyPercent = Math.round(n * 1000) / 1000
  }

  // Арендные каникулы — N льготных месяцев после начала договора (ремонт/заселение).
  let rentFreeMonths: number | null = null
  const rfRaw = String(formData.get("rentFreeMonths") ?? "").trim()
  if (rfRaw) {
    const n = parseInt(rfRaw, 10)
    if (!Number.isInteger(n) || n < 0 || n > 24) throw new Error("Каникулы — целое число месяцев от 0 до 24")
    rentFreeMonths = n
  }

  // Сборка обновления карточки: трогаем только заполненные поля.
  const tenantUpdate: Record<string, unknown> = {}
  // Чекбокс аддитивен: отмечен → освобождаем; не трогаем существующее значение,
  // если не отмечен (иначе случайно снимем ранее выставленное освобождение).
  if (serviceFeeExempt) tenantUpdate.serviceFeeExempt = true
  // График аренды (если задан) переопределяет помесячную сумму в биллинге.
  if (rentScheduleSteps.length > 0) tenantUpdate.rentSchedule = JSON.stringify(rentScheduleSteps)
  if (startDate) tenantUpdate.contractStart = startDate
  if (endDate) tenantUpdate.contractEnd = endDate
  if (paymentDueDay !== null) tenantUpdate.paymentDueDay = paymentDueDay
  if (penaltyPercent !== null) tenantUpdate.penaltyPercent = penaltyPercent
  if (rentFreeMonths !== null) tenantUpdate.rentFreeMonths = rentFreeMonths
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

  // Если задан график — он первичен. База fixedMonthlyRent выставляется в сумму
  // АКТИВНОЙ сейчас ступени, чтобы экраны, не читающие график (узкий select),
  // показывали правильную текущую аренду. Биллинг по периодам всё равно берёт график.
  if (rentScheduleSteps.length > 0) {
    const currentStep = resolveScheduledRent(rentScheduleSteps, new Date().toISOString().slice(0, 7))
    if (currentStep !== null) {
      tenantUpdate.fixedMonthlyRent = currentStep
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

    // Входящий долг — одно начисление-остаток на сумму задолженности на момент
    // переноса в систему. Тип OTHER («Прочее»): считается в долге, но не конфликтует
    // с уникальным индексом (tenant, period, RENT) и не перебивается авто-биллингом.
    if (openingDebt && openingDebt > 0) {
      const period = /^\d{4}-\d{2}$/.test(openingDebtPeriodRaw)
        ? openingDebtPeriodRaw
        : now.toISOString().slice(0, 7)
      await tx.charge.create({
        data: {
          tenantId,
          contractId: created.id,
          period,
          type: "OTHER",
          amount: openingDebt,
          description: `Задолженность по договору № ${number} на дату перехода в Commrent`,
          dueDate: openingDebtDue,
        },
      })
    }
    return created
  })

  revalidatePath("/admin/documents")
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true, contractId: contract.id }
}
