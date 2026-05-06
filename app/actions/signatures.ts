"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { audit } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { assertContractInOrg } from "@/lib/scope-guards"
import { applySignedContractChanges } from "@/lib/contract-addendum"

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
    const { orgId, userId } = await requireOrgAccess()

    // Базовая попытка извлечь IIN/BIN из cert (если он передан в формате PEM)
    const { commonName, iin, bin } = extractCertInfo(input.certPemB64)

    const sig = await db.documentSignature.create({
      data: {
        organizationId: orgId,
        documentType: input.documentType,
        documentId: input.documentId ?? null,
        documentRef: input.documentRef ?? null,
        signerUserId: userId,
        signerName: commonName ?? session.user.name ?? "—",
        signerIin: iin ?? null,
        signerOrgBin: bin ?? null,
        signedHashB64: input.signedHashB64,
        signatureB64: input.signatureB64,
        certPemB64: input.certPemB64,
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
      },
    })

    // Если это договор и status DRAFT → подписание переводит в SIGNED
    if (input.documentType === "CONTRACT" && input.documentId) {
      await assertContractInOrg(input.documentId, orgId)
      const contract = await db.contract.update({
        where: { id: input.documentId },
        data: { status: "SIGNED", signedAt: new Date() },
        select: { id: true, tenantId: true },
      }).catch(() => { /* документ может быть удалён */ })
      if (contract) {
        await applySignedContractChanges(contract.id)
        revalidatePath(`/admin/tenants/${contract.tenantId}`)
      }
      revalidatePath(`/admin/contracts`)
      revalidatePath(`/admin/documents`)
    }

    return { ok: true, id: sig.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить" }
  }
}

/**
 * Минимальный extract из base64 PEM-цепочки сертификатов.
 * Не делает полный X.509 parsing (для этого нужен asn1.js).
 * Ищет CN, серийный номер, IIN/BIN по подстроке.
 */
function extractCertInfo(certB64: string): { commonName?: string; iin?: string; bin?: string } {
  if (!certB64) return {}
  let decoded = ""
  try {
    decoded = Buffer.from(certB64, "base64").toString("binary")
  } catch {
    return {}
  }

  // Грубый поиск IIN/BIN — это 12 цифр обычно идущих после OID 2.5.4.5 (serialNumber)
  // или непосредственно в SubjectAltName. Без ASN.1 parsing найдём по regex.
  const iinMatch = decoded.match(/IIN(\d{12})/) || decoded.match(/(\d{12})/)
  const binMatch = decoded.match(/BIN(\d{12})/)

  // CN — обычно после Common Name тега. Без полноценного парсинга — эвристика.
  // Ищем кириллический строки между управляющими байтами ASN.1.
  let commonName: string | undefined
  const cnPattern = /([А-ЯЁ][А-ЯЁ\s.]{4,40}[А-ЯЁ])/u
  const cnMatch = decoded.match(cnPattern)
  if (cnMatch) commonName = cnMatch[1].trim()

  return {
    commonName,
    iin: iinMatch?.[1] ?? iinMatch?.[0],
    bin: binMatch?.[1],
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
