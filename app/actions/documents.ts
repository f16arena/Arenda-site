"use server"

import { revalidatePath } from "next/cache"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { audit } from "@/lib/audit"
import { assertTenantBuildingAccess } from "@/lib/building-access"
import { getCurrentBuildingId } from "@/lib/current-building"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { contractScope, tenantScope } from "@/lib/tenant-scope"

type DeleteAdminDocumentInput = {
  source: "contract" | "generated"
  id: string
}

type DeleteAdminDocumentResult = {
  ok: boolean
  error?: string
  /** Сколько связанных начислений (долгов) убрано вместе с авто-счётом/АВР. */
  removedCharges?: number
}

export async function deleteAdminDocument(input: DeleteAdminDocumentInput): Promise<DeleteAdminDocumentResult> {
  const session = await requireCapabilityAndFeature("documents.deleteUnsigned")
  const { orgId } = await requireOrgAccess()
  const isOwner = session.role === "OWNER" || session.isPlatformOwner

  try {
    if (!input.id) return { ok: false, error: "Документ не найден." }
    if (input.source === "contract") {
      return deleteContractDocument(input.id, orgId, isOwner)
    }
    if (input.source === "generated") {
      return deleteGeneratedDocument(input.id, orgId, isOwner)
    }
    return { ok: false, error: "Неизвестный тип документа." }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось удалить документ." }
  }
}

async function deleteContractDocument(contractId: string, orgId: string, isOwner: boolean): Promise<DeleteAdminDocumentResult> {
  const contract = await db.contract.findFirst({
    where: { id: contractId, ...contractScope(orgId) },
    select: {
      id: true,
      number: true,
      status: true,
      signedAt: true,
      signedByTenantAt: true,
      signedByLandlordAt: true,
      tenantId: true,
    },
  })
  if (!contract) return { ok: false, error: "Договор не найден или недоступен." }

  await assertTenantBuildingAccess(contract.tenantId, orgId)

  const signatureWhere = signatureWhereFor("CONTRACT", contract.id, contract.number)
  const signatureCount = await db.documentSignature.count({
    where: { organizationId: orgId, ...signatureWhere },
  })
  const signed = isContractSigned(contract, signatureCount)
  if (signed && !isOwner) {
    return { ok: false, error: "Подписанный документ может удалить только владелец." }
  }
  if (signed) await requireCapabilityAndFeature("documents.deleteSigned")

  // Жёсткое удаление: договор стирается физически из БД вместе с подписями.
  // Связанные записи отвязываются автоматически (onDelete: SetNull у addenda/
  // charges/generated-doc). Восстановление невозможно — на это в UI стоит
  // подтверждение вводом слова «удалить».
  await db.$transaction([
    db.documentSignature.deleteMany({
      where: { organizationId: orgId, ...signatureWhere },
    }),
    db.contract.delete({ where: { id: contract.id } }),
  ])

  await audit({
    action: "DELETE",
    entity: "contract",
    entityId: contract.id,
    details: { number: contract.number, status: contract.status, signed, hardDelete: true },
  })

  revalidateDocumentPaths(contract.tenantId)
  return { ok: true }
}

async function deleteGeneratedDocument(documentId: string, orgId: string, isOwner: boolean): Promise<DeleteAdminDocumentResult> {
  const doc = await db.generatedDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
    select: {
      id: true,
      documentType: true,
      number: true,
      tenantId: true,
      tenantName: true,
      fileName: true,
      period: true,
    },
  })
  if (!doc) return { ok: false, error: "Документ не найден или недоступен." }

  const currentBuildingId = await getCurrentBuildingId()
  if (doc.tenantId) {
    await assertTenantBuildingAccess(doc.tenantId, orgId)
    if (currentBuildingId) {
      const tenantVisibleInCurrentBuilding = await db.tenant.findFirst({
        where: { id: doc.tenantId, ...tenantWhereForBuildings([currentBuildingId]) },
        select: { id: true },
      })
      if (!tenantVisibleInCurrentBuilding) return { ok: false, error: "Документ не относится к выбранному зданию." }
    }
  } else if (currentBuildingId) {
    return { ok: false, error: "Документ без контрагента можно удалить только в режиме «Все здания»." }
  }

  const signatureWhere = signatureWhereFor(doc.documentType, doc.id, doc.number)
  const signed = await db.documentSignature.count({
    where: { organizationId: orgId, ...signatureWhere },
  }).then((count) => count > 0)

  if (signed && !isOwner) {
    return { ok: false, error: "Подписанный документ может удалить только владелец." }
  }
  if (signed) await requireCapabilityAndFeature("documents.deleteSigned")

  // Каскад: счёт/АВР — это печатная форма поверх начислений. По решению владельца
  // удаление авто-документа должно убирать и связанный долг, и уведомление.
  // Чистим ТОЛЬКО неоплаченные начисления периода (оплаченные = история, не трогаем;
  // депозит — отдельный поток «Финансы → Депозиты», тоже не трогаем). Soft-delete —
  // восстановимо. Удаляем только если для периода не остаётся другого счёта/АВР.
  const CASCADE_CHARGE_TYPES = ["RENT", "CLEANING", "SERVICE_FEE", "SERVICE_FEE_INDEXED", "SERVICE_DELIVERED", "OTHER"]
  const cascades = (doc.documentType === "INVOICE" || doc.documentType === "ACT") && doc.tenantId && doc.period
  let removedCharges = 0
  let removedNotifs = 0

  await db.$transaction(async (tx) => {
    await tx.documentSignature.deleteMany({ where: { organizationId: orgId, ...signatureWhere } })
    await tx.generatedDocument.delete({ where: { id: doc.id } })

    if (cascades) {
      // Остался ли другой счёт/АВР за тот же период? Если да — начисления нужны ему.
      const siblingDoc = await tx.generatedDocument.findFirst({
        where: {
          organizationId: orgId,
          tenantId: doc.tenantId,
          period: doc.period,
          documentType: { in: ["INVOICE", "ACT"] },
          deletedAt: null,
        },
        select: { id: true },
      })
      if (!siblingDoc) {
        const charges = await tx.charge.updateMany({
          where: {
            tenantId: doc.tenantId!,
            period: doc.period!,
            isPaid: false,
            deletedAt: null,
            type: { in: CASCADE_CHARGE_TYPES },
          },
          data: { deletedAt: new Date() },
        })
        removedCharges = charges.count
      }
    }

    // Уведомление владельцу «документы готовы» (best-effort: ищем по номеру счёта).
    if (cascades && doc.number) {
      const notifs = await tx.notification.deleteMany({
        where: { type: "DOCUMENT_SIGN_REQUEST", message: { contains: doc.number } },
      })
      removedNotifs = notifs.count
    }
  })

  await audit({
    action: "DELETE",
    entity: "document",
    entityId: doc.id,
    details: {
      documentType: doc.documentType,
      number: doc.number,
      tenantId: doc.tenantId,
      tenantName: doc.tenantName,
      fileName: doc.fileName,
      signed,
      removedCharges,
      removedNotifs,
    },
  })

  revalidateDocumentPaths(doc.tenantId)
  return { ok: true, removedCharges }
}

function isContractSigned(
  contract: {
    status: string
    signedAt: Date | null
    signedByTenantAt: Date | null
    signedByLandlordAt: Date | null
  },
  signatureCount: number,
) {
  return (
    signatureCount > 0
    || contract.status === "SIGNED"
    || contract.status === "SIGNED_BY_TENANT"
    || !!contract.signedAt
    || !!contract.signedByTenantAt
    || !!contract.signedByLandlordAt
  )
}

function signatureWhereFor(documentType: string, documentId: string, documentRef?: string | null) {
  return {
    documentType,
    OR: [
      { documentId },
      ...(documentRef ? [{ documentRef }] : []),
    ],
  }
}

function tenantWhereForBuildings(buildingIds: string[]) {
  if (buildingIds.length === 0) return tenantScope(null)
  return {
    OR: [
      { space: { floor: { buildingId: { in: buildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: buildingIds } } } } } },
      { fullFloors: { some: { buildingId: { in: buildingIds } } } },
    ],
  }
}

function revalidateDocumentPaths(tenantId?: string | null) {
  revalidatePath("/admin/documents")
  revalidatePath("/admin/contracts")
  if (tenantId) revalidatePath(`/admin/tenants/${tenantId}`)
}

/**
 * Массовое удаление документов. Каждая запись обрабатывается отдельной
 * транзакцией через `deleteAdminDocument` — это сохраняет аудит,
 * проверки прав на signed-доки и building-scope. Возвращает массив
 * результатов в том же порядке, что и вход.
 *
 * Используется в /admin/documents — выделил N документов → «Удалить выбранные».
 * Один документ-сбой не валит всю операцию: остальные удаляются, в UI
 * показывается только число успешных + ошибочных.
 */
export async function bulkDeleteAdminDocuments(
  inputs: DeleteAdminDocumentInput[],
): Promise<{ ok: boolean; results: Array<{ id: string; ok: boolean; error?: string }>; succeeded: number; failed: number }> {
  if (inputs.length === 0) return { ok: true, results: [], succeeded: 0, failed: 0 }
  if (inputs.length > 100) {
    return { ok: false, results: [], succeeded: 0, failed: inputs.length }
  }
  const results: Array<{ id: string; ok: boolean; error?: string }> = []
  let succeeded = 0
  let failed = 0
  for (const input of inputs) {
    const res = await deleteAdminDocument(input)
    results.push({ id: input.id, ok: res.ok, error: res.error })
    if (res.ok) succeeded += 1
    else failed += 1
  }
  return { ok: failed === 0, results, succeeded, failed }
}
