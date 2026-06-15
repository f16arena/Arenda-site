"use server"

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { buildAvrStateForTenant } from "@/lib/avr-engine/prefill"
import { getActiveContractForTenant } from "@/lib/active-contract"
import { buildAwpXml, type AwpXmlInput } from "@/lib/esf/awp-xml"
import { createSession, createAuthTicket, createSessionSigned, closeSession, uploadAwp, queryAwpStatusById, EsfError } from "@/lib/esf/client"
import { signAwpXml, signTicketXmlDsig, esfSignerConfigured } from "@/lib/esf/signer"

/**
 * Открыть сессию ИС ЭСФ. Если заданы кредиты учётки (ESF_ACCOUNT_USER/PASSWORD) —
 * используем НОВЫЙ флоу под ГОСТ-2015: тикет (AuthService) → xmlDsig-подпись →
 * createSessionSigned. Иначе — старый createSession (под раздельные AUTH+RSA ключи).
 * См. docs/esf-integration-status.md.
 */
async function openEsfSession(orgTin: string, certificatePem: string): Promise<string> {
  const user = process.env.ESF_ACCOUNT_USER
  const password = process.env.ESF_ACCOUNT_PASSWORD
  if (user && password) {
    const ticket = await createAuthTicket(orgTin, user, password)
    const signedTicket = await signTicketXmlDsig(ticket)
    return createSessionSigned(signedTicket, { username: user, password })
  }
  // Фолбэк: старый метод (вернёт METHOD_NOT_SUPPORT_GOST_2015 на ГОСТ-2015 ключе).
  return createSession(orgTin, certificatePem, process.env.ESF_SIGN_CERT_PIN ?? "")
}

/**
 * Отправка АВР в ИС ЭСФ (КГД): собираем XML формы AwpV1 из тех же данных,
 * что и DOCX-акт (договор → позиции), подписываем ЭЦП организации (NCANode),
 * шлём через SOAP API и сохраняем регистрационный номер/статус.
 */

function registrationTypeFor(legalType: string | null): "ENTERPRISE" | "ENTREPRENEUR" | "INDIVIDUAL" {
  const t = String(legalType ?? "").toUpperCase()
  if (t === "TOO" || t === "AO") return "ENTERPRISE"
  if (t === "PHYSICAL") return "INDIVIDUAL"
  return "ENTREPRENEUR" // ИП, ЧСИ, адвокат, нотариус
}

async function requireStaffAccess() {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") throw new Error("Не авторизован")
  if (session.user.role !== "OWNER" && session.user.role !== "ADMIN" && !session.user.isPlatformOwner) {
    throw new Error("Доступно владельцу и администратору")
  }
  return requireOrgAccess()
}

export async function sendActToEsf(documentId: string): Promise<
  { ok: true; regNumber: string | null; status: string } | { ok: false; error: string }
> {
  try {
    const { orgId } = await requireStaffAccess()
    if (!esfSignerConfigured()) {
      return {
        ok: false,
        error: "Подпись для ИС ЭСФ не настроена (ESF_SIGN_P12_BASE64 / ESF_SIGN_P12_PASSWORD). Обратитесь к платформе.",
      }
    }

    const doc = await db.generatedDocument.findFirst({
      where: { id: documentId, organizationId: orgId, documentType: "ACT", deletedAt: null },
      select: { id: true, number: true, tenantId: true, period: true, esfId: true, esfStatus: true },
    })
    if (!doc) return { ok: false, error: "АВР не найден" }
    if (!doc.tenantId || !doc.period) return { ok: false, error: "У АВР нет арендатора или периода" }
    if (doc.esfId && doc.esfStatus !== "FAILED" && doc.esfStatus !== "DECLINED") {
      return { ok: false, error: `АВР уже отправлен в ИС ЭСФ (статус: ${doc.esfStatus ?? "SENT"})` }
    }

    // Те же данные, что и в DOCX-акте: договор + позиции (или начисления периода)
    const avr = await buildAvrStateForTenant(orgId, doc.tenantId, doc.period)
    if (!avr.ok) return { ok: false, error: avr.error }
    const s = avr.state

    const [org, tenant, contract] = await Promise.all([
      db.organization.findUnique({
        where: { id: orgId },
        select: { bin: true, iin: true, bankName: true, iik: true, bik: true },
      }),
      db.tenant.findFirst({
        where: { id: doc.tenantId },
        select: {
          legalType: true,
          bankName: true, iik: true, bik: true,
          bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { bankName: true, iik: true, bik: true } },
        },
      }),
      getActiveContractForTenant(doc.tenantId),
    ])
    const orgTin = (org?.bin || org?.iin || s.executor.binIin || "").replace(/\D/g, "")
    if (orgTin.length !== 12) return { ok: false, error: "Не заполнен БИН/ИИН организации (Настройки → Реквизиты)" }
    const tenantTin = (s.customer.binIin || "").replace(/\D/g, "")
    if (tenantTin.length !== 12) return { ok: false, error: "Не заполнен ИИН/БИН арендатора" }

    const [py, pm] = doc.period.split("-").map(Number)
    const performedDate = new Date(py, pm, 0)
    const tenantBank = tenant?.bankAccounts[0] ?? { bankName: tenant?.bankName ?? null, iik: tenant?.iik ?? null, bik: tenant?.bik ?? null }

    const ndsEnabled = s.vat.enabled
    const ndsRate = ndsEnabled ? s.vat.rate : 0
    const input: AwpXmlInput = {
      number: doc.number ?? s.meta.number ?? "б/н",
      issueDate: new Date(),
      performedDate,
      contract: {
        number: s.contractRef.number || contract?.number || "",
        date: s.contractRef.date ? new Date(s.contractRef.date) : contract?.startDate ?? null,
      },
      sender: {
        tin: orgTin,
        name: s.executor.name,
        address: s.executor.address,
        bank: org?.bankName,
        iik: org?.iik,
        bik: org?.bik,
      },
      recipient: {
        tin: tenantTin,
        name: s.customer.name,
        address: s.customer.address,
        bank: tenantBank.bankName,
        iik: tenantBank.iik,
        bik: tenantBank.bik,
        registrationType: registrationTypeFor(tenant?.legalType ?? null),
      },
      items: s.items.map((item) => {
        const qty = item.qty || 1
        const sumWithoutTax = Math.round(item.price * qty * 100) / 100
        const ndsAmount = ndsEnabled ? Math.round(sumWithoutTax * (ndsRate / 100) * 100) / 100 : 0
        return {
          name: item.name,
          quantity: qty,
          unitPriceWithoutTax: item.price,
          sumWithoutTax,
          ndsRate,
          ndsAmount: ndsEnabled ? ndsAmount : null,
          sumWithTax: sumWithoutTax + ndsAmount,
        }
      }),
      additionalInfo: `Commrent: документ ${doc.number ?? ""} за ${doc.period}`.trim(),
    }

    const awpXml = buildAwpXml(input)
    const signed = await signAwpXml(awpXml)
    if (!signed.certificatePem) {
      return { ok: false, error: "Не удалось получить сертификат подписанта (ESF_SIGN_CERT_PEM)" }
    }

    const sessionId = await openEsfSession(orgTin, signed.certificatePem)
    try {
      const result = await uploadAwp({
        sessionId,
        awpXml,
        signature: signed.signature,
        x509CertificatePem: signed.certificatePem,
      })
      await db.generatedDocument.update({
        where: { id: doc.id },
        data: {
          esfId: result.id,
          esfRegNumber: result.registrationNumber,
          esfStatus: "SENT",
          esfSentAt: new Date(),
          esfError: null,
        },
      })
      revalidatePath("/admin/documents")
      return { ok: true, regNumber: result.registrationNumber, status: "SENT" }
    } finally {
      await closeSession(sessionId)
    }
  } catch (e) {
    const message = e instanceof EsfError || e instanceof Error ? e.message : "Не удалось отправить в ИС ЭСФ"
    // Фиксируем ошибку у документа, чтобы была видна в UI
    await db.generatedDocument.update({
      where: { id: documentId },
      data: { esfStatus: "FAILED", esfError: message.slice(0, 500) },
    }).catch(() => {})
    revalidatePath("/admin/documents")
    return { ok: false, error: message }
  }
}

/** Обновить статус АВР из ИС ЭСФ (подтверждён ли арендатором). */
export async function refreshEsfStatus(documentId: string): Promise<
  { ok: true; status: string | null; regNumber: string | null } | { ok: false; error: string }
> {
  try {
    const { orgId } = await requireStaffAccess()
    const doc = await db.generatedDocument.findFirst({
      where: { id: documentId, organizationId: orgId, documentType: "ACT", deletedAt: null },
      select: { id: true, esfId: true },
    })
    if (!doc?.esfId) return { ok: false, error: "АВР ещё не отправлен в ИС ЭСФ" }

    const org = await db.organization.findUnique({ where: { id: orgId }, select: { bin: true, iin: true } })
    const orgTin = (org?.bin || org?.iin || "").replace(/\D/g, "")
    const signed = await signAwpXml("status-check") // только ради сертификата сессии
    const sessionId = await openEsfSession(orgTin, signed.certificatePem)
    try {
      const result = await queryAwpStatusById(sessionId, doc.esfId)
      await db.generatedDocument.update({
        where: { id: doc.id },
        data: {
          ...(result.status ? { esfStatus: result.status } : {}),
          ...(result.registrationNumber ? { esfRegNumber: result.registrationNumber } : {}),
        },
      })
      revalidatePath("/admin/documents")
      return { ok: true, status: result.status, regNumber: result.registrationNumber }
    } finally {
      await closeSession(sessionId)
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось получить статус" }
  }
}
