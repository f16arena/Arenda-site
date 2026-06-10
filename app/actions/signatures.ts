"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { audit } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { assertContractInOrg } from "@/lib/scope-guards"
import { applySignedContractChanges } from "@/lib/contract-addendum"
import { ensureDepositCharge } from "@/lib/deposit"
import { sendSignedContractEmails } from "@/lib/contract-signed-email"
import { autoCreateDocumentsForSignedContract } from "@/lib/auto-documents"
import { sendGeneratedDocumentToTenant } from "@/lib/document-delivery"
import { after } from "next/server"
import { parseCmsSignature, validateSigner, signerDisplayName } from "@/lib/ncalayer-cms"
import { verifyCmsWithNcanode } from "@/lib/ncanode"

export interface SaveSignatureInput {
  documentType: "CONTRACT" | "INVOICE" | "ACT" | "RECONCILIATION" | "HANDOVER"
  documentId?: string
  documentRef?: string
  signedHashB64: string
  signatureB64: string
  certPemB64: string
}

export interface SaveSignatureResult {
  ok: boolean
  id?: string
  error?: string
}

/**
 * Сохраняет подпись от NCALayer в БД.
 * Извлекает данные подписанта из сертификата (CN, IIN, BIN).
 *
 * Полная криптографическая верификация подписи (валидность цепочки X.509,
 * соответствие хеша) — отдельная задача, требует библиотеки asn1.js или
 * node-forge. Сейчас доверяем NCALayer (он подписывает только своими
 * сертификатами от НУЦ РК) и сохраняем подпись для последующей валидации
 * при необходимости (через openssl cms -verify).
 */
export async function saveSignature(input: SaveSignatureInput): Promise<SaveSignatureResult> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }

  try {
    await requireCapabilityAndFeature("documents.sign")
    const { orgId, userId } = await requireOrgAccess()

    // Сначала проверяем принадлежность договора организации — и только потом
    // пишем подпись/меняем статус (раньше подпись создавалась до проверки scope).
    if (input.documentType === "CONTRACT" && input.documentId) {
      await assertContractInOrg(input.documentId, orgId)
      // Не даём переподписать уже завершённый договор (как в contract-workflow.ts):
      // повторная подпись заново флипнула бы статус/signedAt и могла повторно
      // запустить applySignedContractChanges для доп. соглашения.
      const existing = await db.contract.findFirst({
        where: { id: input.documentId },
        select: { status: true },
      })
      if (existing && (existing.status === "SIGNED" || existing.status === "REJECTED")) {
        return { ok: false, error: "Договор уже завершён (подписан или отклонён)" }
      }
    }

    // Разбираем CMS: достаём сертификат подписанта (ФИО, ИИН, БИН, срок, издатель).
    const parsed = parseCmsSignature(input.signatureB64)
    const signer = parsed.signer
    const commonName = signerDisplayName(signer)
    const warnings = validateSigner(signer)

    // Метка доверенного времени (TSP) — извлекаем через NCANode, если настроен.
    let tspGenTime: Date | null = null
    let tspSerial: string | null = null
    if (process.env.NCANODE_SECRET) {
      const v = await verifyCmsWithNcanode(input.signatureB64)
      const t = v.signers.find((s) => s.tspGenTime)?.tspGenTime
      if (t) { const d = new Date(t); if (!Number.isNaN(d.getTime())) tspGenTime = d }
      tspSerial = v.signers.find((s) => s.tspSerial)?.tspSerial ?? null
    }

    const sig = await db.documentSignature.create({
      data: {
        organizationId: orgId,
        documentType: input.documentType,
        documentId: input.documentId ?? null,
        documentRef: input.documentRef ?? null,
        signerUserId: userId,
        signerName: commonName ?? session.user.name ?? "—",
        signerIin: signer?.iin ?? null,
        signerOrgBin: signer?.bin ?? null,
        signedHashB64: input.signedHashB64,
        signatureB64: input.signatureB64,
        certPemB64: signer?.certDerB64 ?? input.certPemB64,
        validFrom: signer?.validFrom ?? null,
        validTo: signer?.validTo ?? null,
        tspGenTime,
        tspSerial,
      },
      select: { id: true },
    })

    await audit({
      action: "CREATE",
      entity: "user", // используем как generic
      entityId: sig.id,
      details: {
        type: "signature",
        documentType: input.documentType,
        documentId: input.documentId,
        signerName: commonName,
        signerIin: signer?.iin,
        signerBin: signer?.bin,
        issuer: signer?.issuerCommonName,
        warnings: warnings.length ? warnings : undefined,
      },
    })

    // Если это договор и status DRAFT → подписание переводит в SIGNED
    if (input.documentType === "CONTRACT" && input.documentId) {
      const contract = await db.contract.update({
        where: { id: input.documentId },
        data: { status: "SIGNED", signedAt: new Date() },
        select: { id: true, tenantId: true },
      }).catch(() => { /* документ может быть удалён */ })
      if (contract) {
        await applySignedContractChanges(contract.id)
        await ensureDepositCharge(contract.id)
        // Подписанный договор уходит на email обеим сторонам после ответа (не блокируем UI).
        after(() => sendSignedContractEmails(contract.id))
        // Конвейер: счёт + АВР за текущий месяц создаются автоматически, владельцу — на подпись.
        after(() => autoCreateDocumentsForSignedContract(contract.id))
        revalidatePath(`/admin/tenants/${contract.tenantId}`)
      }
      revalidatePath(`/admin/contracts`)
      revalidatePath(`/admin/documents`)
    }

    // Счёт/АВР/акт сверки: после подписи арендодателем документ автоматически
    // уходит арендатору (email с PDF + уведомление в кабинете).
    if (input.documentType !== "CONTRACT" && input.documentId) {
      const documentId = input.documentId
      after(() => sendGeneratedDocumentToTenant(documentId))
    }

    return { ok: true, id: sig.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить" }
  }
}

/**
 * Возвращает все подписи документа (для отображения "подписан кем").
 */
export async function getSignaturesForDocument(documentType: string, documentId: string) {
  const { orgId } = await requireOrgAccess()
  return db.documentSignature.findMany({
    where: {
      organizationId: orgId,
      documentType,
      documentId,
    },
    orderBy: { signedAt: "desc" },
    select: {
      id: true, signerName: true, signerIin: true, signerOrgBin: true,
      signedAt: true, algorithm: true,
    },
  })
}
