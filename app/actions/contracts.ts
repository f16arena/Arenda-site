"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg, assertContractInOrg, assertTenantInOrg } from "@/lib/scope-guards"
import { contractScope } from "@/lib/tenant-scope"
import { isContractNumberUnique, suggestContractNumber } from "@/lib/contract-numbering"
import type { DocumentKind } from "@/lib/document-numbering"
import { getTenantPrimaryBuildingId } from "@/lib/tenant-placement"
import { getT } from "@/lib/i18n/server"

const KIND_TO_FIELD: Record<DocumentKind, "contractPrefix" | "invoicePrefix" | "actPrefix" | "reconciliationPrefix"> = {
  contract: "contractPrefix",
  invoice: "invoicePrefix",
  act: "actPrefix",
  reconciliation: "reconciliationPrefix",
}

// Кириллица допустима — для номеров счетов-фактур типично использовать русские суффиксы (СФ, АОУ).
const PREFIX_VALID = /^[A-Za-zА-Яа-яЁё0-9-]{1,10}$/

export async function setDocumentPrefix(buildingId: string, kind: DocumentKind, formData: FormData) {
  const { t } = await getT()
  await requireCapabilityAndFeature("settings.updateOrganization")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)
  const raw = String(formData.get("prefix") ?? "").trim()
  // Латиницу приводим к uppercase, кириллицу не трогаем (toUpperCase для неё корректен).
  const prefix = raw.toUpperCase()
  if (prefix && !PREFIX_VALID.test(prefix)) {
    throw new Error(t("actions.contracts.badPrefix"))
  }
  await db.building.update({
    where: { id: buildingId },
    data: { [KIND_TO_FIELD[kind]]: prefix || null },
  })
  revalidatePath("/admin/settings")
  revalidatePath("/admin/buildings")
}

// Старый API — оставляем для совместимости со страницами/формами, которые могут
// его использовать. Новый код должен вызывать setDocumentPrefix(_, "contract", ...).
export async function setContractPrefix(buildingId: string, formData: FormData) {
  return setDocumentPrefix(buildingId, "contract", formData)
}

export async function createContract(formData: FormData) {
  const { t } = await getT()
  await requireCapabilityAndFeature("documents.create")
  const { orgId } = await requireOrgAccess()

  const tenantId = String(formData.get("tenantId") ?? "")
  await assertTenantInOrg(tenantId, orgId)

  const number = String(formData.get("number") ?? "").trim()
  const startDate = String(formData.get("startDate") ?? "")
  const endDate = String(formData.get("endDate") ?? "")
  const type = String(formData.get("type") ?? "STANDARD")
  const content = String(formData.get("content") ?? "")

  if (!number) throw new Error(t("actions.contracts.numberRequired"))

  // Найдём здание арендатора для проверки уникальности номера
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      space: { include: { floor: { select: { buildingId: true } } } },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { space: { select: { number: true, area: true, floor: { select: { name: true, buildingId: true } } } } },
        take: 1,
      },
      fullFloors: { select: { buildingId: true } },
    },
  })
  if (!tenant) throw new Error(t("actions.common.tenantNotFound"))

  const buildingId = getTenantPrimaryBuildingId(tenant)
  if (!buildingId) throw new Error(t("actions.contracts.tenantHasNoPlacement"))

  const unique = await isContractNumberUnique(buildingId, number)
  if (!unique) {
    const suggested = await suggestContractNumber(buildingId)
    throw new Error(t("actions.contracts.numberTaken", { number, suggested }))
  }

  const contract = await db.contract.create({
    data: {
      tenantId,
      number,
      type,
      content: content || `Договор аренды № ${number}`,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      status: "DRAFT",
    },
  })

  // Обновим контра-счётчик в здании (для подсказки следующего)
  const seqMatch = number.match(/(\d+)$/)
  if (seqMatch) {
    const seq = parseInt(seqMatch[1])
    await db.building.update({
      where: { id: buildingId },
      data: { contractCounter: { set: seq } },
    })
  }

  revalidatePath("/admin/contracts")
  revalidatePath("/admin/documents")
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { id: contract.id }
}

/**
 * Создать новую версию договора. Применяется когда условия меняются настолько,
 * что нужен новый подписанный документ (новые startDate/endDate/content), но
 * сохраняется привязка к арендатору и преемственность номера. Контракт-предок
 * переходит в статус ARCHIVED, новая запись получает version = parent.version + 1
 * и parentVersionId = parent.id.
 *
 * НЕ путать с ADDENDUM (доп. соглашение через parentContractId/changeKind):
 * аддендум — это патч поверх действующего договора, версия — это полная замена.
 */
export async function createContractVersion(
  parentId: string,
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  // Переводчик нужен и в catch — объявляем до try.
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("documents.create")
    const { orgId } = await requireOrgAccess()
    await assertContractInOrg(parentId, orgId)

    const parent = await db.contract.findFirst({
      where: { id: parentId, ...contractScope(orgId) },
      select: {
        id: true,
        tenantId: true,
        number: true,
        type: true,
        content: true,
        version: true,
        status: true,
      },
    })
    if (!parent) return { ok: false, error: t("actions.common.contractNotFound") }
    if (parent.status === "ARCHIVED") {
      return { ok: false, error: t("actions.contracts.alreadyArchived") }
    }

    const startDateRaw = String(formData.get("startDate") ?? "").trim()
    const endDateRaw = String(formData.get("endDate") ?? "").trim()
    const content = String(formData.get("content") ?? "").trim() || parent.content

    const startDate = startDateRaw ? new Date(startDateRaw) : null
    const endDate = endDateRaw ? new Date(endDateRaw) : null
    if (startDate && Number.isNaN(startDate.getTime())) {
      return { ok: false, error: t("actions.contracts.badStartDate") }
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      return { ok: false, error: t("actions.contracts.badEndDate") }
    }

    const result = await db.$transaction(async (tx) => {
      // Архивируем предка. Не трогаем сам контракт-flow — следующая версия
      // начнёт собственный жизненный цикл DRAFT→SENT→...
      await tx.contract.update({
        where: { id: parent.id },
        data: { status: "ARCHIVED" },
      })

      const created = await tx.contract.create({
        data: {
          tenantId: parent.tenantId,
          number: parent.number,
          type: parent.type,
          content,
          status: "DRAFT",
          startDate,
          endDate,
          version: parent.version + 1,
          parentVersionId: parent.id,
        },
        select: { id: true },
      })
      return created
    })

    revalidatePath("/admin/contracts")
    revalidatePath("/admin/documents")
    revalidatePath(`/admin/tenants/${parent.tenantId}`)
    return { ok: true, id: result.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.contracts.versionCreateFailed") }
  }
}
