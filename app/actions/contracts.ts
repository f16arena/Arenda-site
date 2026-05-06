"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg, assertTenantInOrg } from "@/lib/scope-guards"
import { isContractNumberUnique, suggestContractNumber } from "@/lib/contract-numbering"
import type { DocumentKind } from "@/lib/document-numbering"
import { getTenantPrimaryBuildingId } from "@/lib/tenant-placement"

const KIND_TO_FIELD: Record<DocumentKind, "contractPrefix" | "invoicePrefix" | "actPrefix" | "reconciliationPrefix"> = {
  contract: "contractPrefix",
  invoice: "invoicePrefix",
  act: "actPrefix",
  reconciliation: "reconciliationPrefix",
}

// Кириллица допустима — для номеров счетов-фактур типично использовать русские суффиксы (СФ, АОУ).
const PREFIX_VALID = /^[A-Za-zА-Яа-яЁё0-9-]{1,10}$/

export async function setDocumentPrefix(buildingId: string, kind: DocumentKind, formData: FormData) {
  await requireCapabilityAndFeature("settings.updateOrganization")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)
  const raw = String(formData.get("prefix") ?? "").trim()
  // Латиницу приводим к uppercase, кириллицу не трогаем (toUpperCase для неё корректен).
  const prefix = raw.toUpperCase()
  if (prefix && !PREFIX_VALID.test(prefix)) {
    throw new Error("Префикс: до 10 символов (буквы, цифры, дефис)")
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
  await requireCapabilityAndFeature("documents.create")
  const { orgId } = await requireOrgAccess()

  const tenantId = String(formData.get("tenantId") ?? "")
  await assertTenantInOrg(tenantId, orgId)

  const number = String(formData.get("number") ?? "").trim()
  const startDate = String(formData.get("startDate") ?? "")
  const endDate = String(formData.get("endDate") ?? "")
  const type = String(formData.get("type") ?? "STANDARD")
  const content = String(formData.get("content") ?? "")

  if (!number) throw new Error("Не указан номер договора")

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
  if (!tenant) throw new Error("Арендатор не найден")

  const buildingId = getTenantPrimaryBuildingId(tenant)
  if (!buildingId) throw new Error("Арендатор не привязан ни к помещению ни к этажу")

  const unique = await isContractNumberUnique(buildingId, number)
  if (!unique) {
    const suggested = await suggestContractNumber(buildingId)
    throw new Error(`Номер «${number}» уже используется в этом здании. Предлагается: ${suggested}`)
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
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { id: contract.id }
}
