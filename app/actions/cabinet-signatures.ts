"use server"

import crypto from "crypto"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { parseCmsSignature, validateSigner, signerDisplayName } from "@/lib/ncalayer-cms"
import { verifyCmsWithNcanode } from "@/lib/ncanode"
import { getT } from "@/lib/i18n/server"

const SIGNABLE_TYPES = ["ACT", "RECONCILIATION"]
const BLOCKING_WARNINGS = ["Срок действия сертификата истёк", "Сертификат ещё не вступил в силу"]

/** Загружает выставленный документ, принадлежащий текущему арендатору, проверяет тип/повтор. */
async function loadOwnSignable(documentId: string) {
  const { t } = await getT()
  const session = await auth()
  if (!session?.user) return { error: t("actions.common.noAccess") }
  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true, bin: true, iin: true, companyName: true, directorName: true, user: { select: { name: true } } },
  })
  if (!tenant) return { error: t("actions.common.tenantProfileNotFound") }
  const doc = await db.generatedDocument.findFirst({
    where: { id: documentId, tenantId: tenant.id, deletedAt: null },
    select: { id: true, documentType: true, organizationId: true, number: true, fileBytes: true },
  })
  if (!doc) return { error: t("actions.common.documentNotFound") }
  if (!SIGNABLE_TYPES.includes(doc.documentType)) return { error: t("actions.signing.notSignable") }

  const already = await db.documentSignature.findFirst({
    where: { documentType: doc.documentType, documentId: doc.id, signerUserId: session.user.id },
    select: { id: true },
  })
  return { session, tenant, doc, alreadySigned: !!already }
}

/** Простая подпись арендатором (подтверждение/ознакомление) выставленного акта. */
export async function signIssuedDocumentSimple(documentId: string): Promise<{ ok: boolean; error?: string }> {
  // Переводчик нужен и в catch — объявляем до try.
  const { t } = await getT()
  try {
    const r = await loadOwnSignable(documentId)
    if ("error" in r) return { ok: false, error: r.error }
    if (r.alreadySigned) return { ok: true }
    const { session, tenant, doc } = r
    const hash = crypto.createHash("sha256").update(Buffer.from(doc.fileBytes)).digest("base64")
    await db.documentSignature.create({
      data: {
        organizationId: doc.organizationId,
        documentType: doc.documentType,
        documentId: doc.id,
        signerUserId: session.user.id,
        signerName: tenant.directorName || tenant.companyName || tenant.user?.name || "Арендатор",
        signerIin: tenant.iin ?? null,
        signerOrgBin: tenant.bin ?? null,
        signedHashB64: hash,
        signatureB64: "",
        certPemB64: "",
        algorithm: "Простая ЭП (кабинет арендатора)",
      },
    })
    revalidatePath("/cabinet/documents")
    revalidatePath("/admin/documents")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.signing.signFailed") }
  }
}

/** ЭЦП НУЦ РК (через NCALayer) арендатором: подписывает байты документа. */
export async function signIssuedDocumentEcp(documentId: string, cmsB64: string): Promise<{ ok: boolean; error?: string }> {
  const { t } = await getT()
  try {
    if (!cmsB64 || cmsB64.length < 100) return { ok: false, error: t("actions.signing.emptySignature") }
    const r = await loadOwnSignable(documentId)
    if ("error" in r) return { ok: false, error: r.error }
    if (r.alreadySigned) return { ok: true }
    const { session, tenant, doc } = r

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

    // Сверка личности (строго): реквизиты арендатора обязаны быть заполнены,
    // и ИИН/БИН сертификата должен совпасть с ними.
    const expected = [tenant.bin, tenant.iin].map((x) => String(x ?? "").replace(/\D/g, "")).filter((x) => x.length === 12)
    if (!expected.length) {
      return { ok: false, error: t("actions.signing.tenantIdentityMissing") }
    }
    const got = [signer.iin, signer.bin].filter((x): x is string => !!x)
    if (!got.some((g) => expected.includes(g))) {
      return { ok: false, error: t("actions.signing.wrongSignerTenant", { got: got.join("/") || "—" }) }
    }

    // Криптопроверка через NCANode (если настроен) + извлечение метки времени (TSP).
    let tspGenTime: Date | null = null
    let tspSerial: string | null = null
    if (process.env.NCANODE_SECRET) {
      const v = await verifyCmsWithNcanode(cmsB64)
      if (!v.valid) return { ok: false, error: t("actions.signing.cryptoCheckFailed", { reason: v.reason ?? "" }) }
      // Имя t занято переводчиком — метка времени называется stampedAt.
      const stampedAt = v.signers.find((s) => s.tspGenTime)?.tspGenTime
      if (stampedAt) { const d = new Date(stampedAt); if (!Number.isNaN(d.getTime())) tspGenTime = d }
      tspSerial = v.signers.find((s) => s.tspSerial)?.tspSerial ?? null
    }

    const hash = crypto.createHash("sha256").update(Buffer.from(doc.fileBytes)).digest("base64")
    await db.documentSignature.create({
      data: {
        organizationId: doc.organizationId,
        documentType: doc.documentType,
        documentId: doc.id,
        signerUserId: session.user.id,
        signerName: signerDisplayName(signer) ?? tenant.companyName ?? "Арендатор",
        signerIin: signer.iin ?? tenant.iin ?? null,
        signerOrgBin: signer.bin ?? tenant.bin ?? null,
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
    revalidatePath("/cabinet/documents")
    revalidatePath("/admin/documents")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.signing.signFailed") }
  }
}
