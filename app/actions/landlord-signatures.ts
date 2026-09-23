"use server"

import crypto from "crypto"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { parseCmsSignature, validateSigner, signerDisplayName } from "@/lib/ncalayer-cms"
import { verifyCmsWithNcanode } from "@/lib/ncanode"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { getT } from "@/lib/i18n/server"

const SIGNABLE_TYPES = ["ACT", "RECONCILIATION", "INVOICE"]
const BLOCKING_WARNINGS = ["Срок действия сертификата истёк", "Сертификат ещё не вступил в силу"]

/**
 * Подпись выставленного документа (АВР / Акт сверки / Счёт) АРЕНДОДАТЕЛЕМ через
 * ЭЦП НУЦ РК (NCALayer). Полный контур: привязка к байтам файла, сверка ИИН/БИН с
 * реквизитами организации, криптопроверка NCANode + метка времени (TSP). Идемпотентно.
 */
export async function signIssuedDocumentByLandlordEcp(
  documentId: string,
  cmsB64: string,
): Promise<{ ok: boolean; error?: string }> {
  // Переводчик нужен и в catch — объявляем до try.
  const { t } = await getT()
  try {
    if (!cmsB64 || cmsB64.length < 100) return { ok: false, error: t("actions.signing.emptySignature") }
    await requireCapabilityAndFeature("documents.sign")
    const { orgId, userId } = await requireOrgAccess()

    const doc = await db.generatedDocument.findFirst({
      where: { id: documentId, organizationId: orgId, deletedAt: null },
      select: { id: true, documentType: true, organizationId: true, fileBytes: true },
    })
    if (!doc) return { ok: false, error: t("actions.documents.documentNotAvailable") }
    if (!SIGNABLE_TYPES.includes(doc.documentType)) return { ok: false, error: t("actions.signing.notSignable") }

    // Идемпотентность: этот пользователь уже подписал — успех без дубля.
    const already = await db.documentSignature.findFirst({
      where: { documentType: doc.documentType, documentId: doc.id, signerUserId: userId },
      select: { id: true },
    })
    if (already) return { ok: true }

    const parsed = parseCmsSignature(cmsB64)
    if (!parsed.ok || !parsed.signer) return { ok: false, error: parsed.error ?? t("actions.signing.parseFailed") }
    const signer = parsed.signer

    const warnings = validateSigner(signer)
    const blocking = warnings.filter((w) => BLOCKING_WARNINGS.includes(w))
    if (blocking.length) return { ok: false, error: blocking.join("; ") }

    // Привязка: вложенные в CMS данные = байты документа.
    const fileB64 = Buffer.from(doc.fileBytes).toString("base64")
    if (parsed.encapsulatedContentB64 && parsed.encapsulatedContentB64 !== fileB64) {
      return { ok: false, error: t("actions.signing.documentMismatch") }
    }

    // Сверка личности (строго): реквизиты организации обязаны быть заполнены,
    // и ИИН/БИН сертификата должен совпасть с ними.
    const req = await getOrganizationRequisites(orgId).catch(() => null)
    const expected = [req?.bin, req?.iin, req?.taxId].map((x) => String(x ?? "").replace(/\D/g, "")).filter((x) => x.length === 12)
    if (!expected.length) {
      return { ok: false, error: t("actions.signing.orgIdentityMissing") }
    }
    const got = [signer.iin, signer.bin].filter((x): x is string => !!x)
    if (!got.some((g) => expected.includes(g))) {
      return { ok: false, error: t("actions.signing.wrongSignerOrg", { got: got.join("/") || "—" }) }
    }

    // Криптопроверка NCANode + метка времени (TSP).
    let tspGenTime: Date | null = null
    let tspSerial: string | null = null
    if (process.env.NCANODE_SECRET) {
      const v = await verifyCmsWithNcanode(cmsB64)
      if (!v.valid) return { ok: false, error: t("actions.signing.cryptoCheckFailed", { reason: v.reason ?? "" }) }
      const stamp = v.signers.find((s) => s.tspGenTime)?.tspGenTime
      if (stamp) {
        const d = new Date(stamp)
        if (!Number.isNaN(d.getTime())) tspGenTime = d
      }
      tspSerial = v.signers.find((s) => s.tspSerial)?.tspSerial ?? null
    }

    const hash = crypto.createHash("sha256").update(Buffer.from(doc.fileBytes)).digest("base64")
    await db.documentSignature.create({
      data: {
        organizationId: doc.organizationId,
        documentType: doc.documentType,
        documentId: doc.id,
        signerUserId: userId,
        signerName: signerDisplayName(signer) ?? "Арендодатель",
        signerIin: signer.iin ?? null,
        signerOrgBin: signer.bin ?? null,
        signedHashB64: hash,
        signatureB64: cmsB64,
        certPemB64: signer.certDerB64 ?? "",
        validFrom: signer.validFrom ?? null,
        validTo: signer.validTo ?? null,
        algorithm: "ЭЦП НУЦ РК (NCALayer)",
        tspGenTime,
        tspSerial,
      },
    })
    revalidatePath("/admin/documents")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.signing.signFailed") }
  }
}
