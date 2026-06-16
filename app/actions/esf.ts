"use server"

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { buildAvrStateForTenant } from "@/lib/avr-engine/prefill"
import { getActiveContractForTenant } from "@/lib/active-contract"
import { buildAwpXml, type AwpXmlInput } from "@/lib/esf/awp-xml"
import { buildInvoiceXml, type InvoiceXmlInput } from "@/lib/esf/invoice-xml"
import { closeSession, uploadAwp, queryAwpStatusById, uploadInvoice, queryInvoiceSummaryById, queryInvoiceErrorById, EsfError } from "@/lib/esf/client"
import { signAwpXml, esfSignerConfigured } from "@/lib/esf/signer"
import { resolveOrgEsfConfig } from "@/lib/esf/config"
import { openEsfSession } from "@/lib/esf/session"

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
  let diagAwpXml = "" // ВРЕМЕННО: для записи в esf_diag при ошибке
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
        select: { bin: true, iin: true, bankName: true, iik: true, bik: true, directorName: true, directorPosition: true },
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

    // Реквизиты ЭСФ организации (per-org из БД, иначе env bootstrap-орг).
    const cfgRes = await resolveOrgEsfConfig(orgId, orgTin)
    if (!cfgRes.ok) return { ok: false, error: cfgRes.error }
    const cfg = cfgRes.config

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
          gsvsCode: cfg.gsvsCode,
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
    diagAwpXml = awpXml
    const signed = await signAwpXml(awpXml, { certPath: cfg.certPath, certPin: cfg.certPin, certData: cfg.certData })
    if (!signed.certificatePem) {
      return { ok: false, error: "Не удалось получить сертификат подписанта от сервиса подписи" }
    }

    // Сессия по новому протоколу ГОСТ-2015 (createAuthTicket → xmlDsig → createSessionSigned).
    const sessionId = await openEsfSession(cfg)
    try {
      const senderSignerName = (org?.directorName || org?.directorPosition || s.executor.name || "Руководитель").trim().slice(0, 200)
      const result = await uploadAwp({
        sessionId,
        awpXml,
        signature: signed.signature,
        x509CertificatePem: signed.certificatePem,
        senderSignerName,
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
      await closeSession(sessionId, cfg.wsUsername, cfg.wsPassword)
    }
  } catch (e) {
    const message = e instanceof EsfError || e instanceof Error ? e.message : "Не удалось отправить в ИС ЭСФ"
    // ВРЕМЕННО: полная диагностика в esf_diag (awpXml + сырой ответ КГД).
    const raw = e instanceof EsfError ? (e.raw ?? "") : (e instanceof Error ? e.stack ?? "" : "")
    await db.$executeRawUnsafe("INSERT INTO esf_diag (awp_xml, fault_raw) VALUES ($1, $2)", diagAwpXml, raw || message).catch(() => {})
    // Фиксируем ошибку у документа, чтобы была видна в UI
    await db.generatedDocument.update({
      where: { id: documentId },
      data: { esfStatus: "FAILED", esfError: message.slice(0, 500) },
    }).catch(() => {})
    revalidatePath("/admin/documents")
    return { ok: false, error: message }
  }
}

/**
 * Отправка ЭСФ (счёт-фактуры, форма InvoiceV2) в ИС ЭСФ для документа-счёта.
 * Данные те же, что в счёте (договор → начисления периода). Подпись —
 * сырая ГОСТ-подпись XML-тела (как у АВР), загрузка — syncInvoice.
 */
export async function sendInvoiceToEsf(documentId: string): Promise<
  { ok: true; regNumber: string | null; status: string } | { ok: false; error: string }
> {
  let diagXml = "" // ВРЕМЕННО: для записи в esf_diag при ошибке
  try {
    const { orgId } = await requireStaffAccess()
    if (!esfSignerConfigured()) {
      return { ok: false, error: "Подпись для ИС ЭСФ не настроена. Обратитесь к платформе." }
    }

    const doc = await db.generatedDocument.findFirst({
      where: { id: documentId, organizationId: orgId, documentType: "INVOICE", deletedAt: null },
      select: { id: true, number: true, tenantId: true, period: true, esfId: true, esfStatus: true },
    })
    if (!doc) return { ok: false, error: "Счёт не найден" }
    if (!doc.tenantId || !doc.period) return { ok: false, error: "У счёта нет арендатора или периода" }
    if (doc.esfId && doc.esfStatus !== "FAILED" && doc.esfStatus !== "DECLINED") {
      return { ok: false, error: `Счёт уже отправлен в ИС ЭСФ (статус: ${doc.esfStatus ?? "SENT"})` }
    }

    const avr = await buildAvrStateForTenant(orgId, doc.tenantId, doc.period)
    if (!avr.ok) return { ok: false, error: avr.error }
    const s = avr.state

    const [org, contract] = await Promise.all([
      db.organization.findUnique({
        where: { id: orgId },
        select: {
          bin: true, iin: true, bankName: true, iik: true, bik: true, kbe: true,
          directorName: true, directorPosition: true, isVatPayer: true, vatRate: true, vatNumber: true,
        },
      }),
      getActiveContractForTenant(doc.tenantId),
    ])
    const orgTin = (org?.bin || org?.iin || s.executor.binIin || "").replace(/\D/g, "")
    if (orgTin.length !== 12) return { ok: false, error: "Не заполнен БИН/ИИН организации (Настройки → Реквизиты)" }
    const tenantTin = (s.customer.binIin || "").replace(/\D/g, "")
    if (tenantTin.length !== 12) return { ok: false, error: "Не заполнен ИИН/БИН арендатора" }

    const cfgRes = await resolveOrgEsfConfig(orgId, orgTin)
    if (!cfgRes.ok) return { ok: false, error: cfgRes.error }
    const cfg = cfgRes.config

    // num — только цифры (схема [0-9]{1,30}). Из номера счёта, иначе из периода.
    const num = (doc.number ?? "").replace(/\D/g, "") || doc.period.replace(/\D/g, "")
    // Дата оборота не может быть в будущем (КГД ФЛК) — ставим дату выписки,
    // как и в ручном ЭСФ.
    const issueDate = new Date()
    const turnoverDate = issueDate

    const ndsEnabled = s.vat.enabled
    const ndsRate = ndsEnabled ? s.vat.rate : 0
    const operator = (org?.directorName || s.executor.name || "Руководитель").trim()

    const input: InvoiceXmlInput = {
      number: num,
      issueDate,
      turnoverDate,
      operatorFullname: operator,
      contract: {
        number: s.contractRef.number || contract?.number || "",
        date: s.contractRef.date ? new Date(s.contractRef.date) : contract?.startDate ?? null,
      },
      deliveryDoc: { number: doc.number, date: issueDate },
      paymentForm: "NON_CASH",
      seller: {
        tin: orgTin,
        name: s.executor.name,
        address: s.executor.address,
        bank: org?.bankName,
        bik: org?.bik,
        iik: org?.iik,
        kbe: org?.kbe,
        certificateNum: ndsEnabled ? org?.vatNumber : null,
      },
      customer: {
        tin: tenantTin,
        name: s.customer.name,
        address: s.customer.address,
        countryCode: "KZ",
      },
      items: s.items.map((item) => {
        const qty = item.qty || 1
        const priceWithoutTax = Math.round(item.price * qty * 100) / 100
        const ndsAmount = ndsEnabled ? Math.round(priceWithoutTax * (ndsRate / 100) * 100) / 100 : 0
        return {
          name: item.name,
          quantity: qty,
          unitPriceWithoutTax: item.price,
          priceWithoutTax,
          ndsRate: ndsEnabled ? ndsRate : null,
          ndsAmount,
          priceWithTax: priceWithoutTax + ndsAmount,
        }
      }),
    }

    const invoiceXml = buildInvoiceXml(input)
    diagXml = invoiceXml
    const signed = await signAwpXml(invoiceXml, { certPath: cfg.certPath, certPin: cfg.certPin, certData: cfg.certData })
    if (!signed.certificatePem) {
      return { ok: false, error: "Не удалось получить сертификат подписанта от сервиса подписи" }
    }

    const sessionId = await openEsfSession(cfg)
    try {
      const result = await uploadInvoice({
        sessionId,
        invoiceXml,
        signature: signed.signature,
        x509CertificatePem: signed.certificatePem,
      })
      await db.generatedDocument.update({
        where: { id: doc.id },
        data: {
          esfId: result.id,
          esfStatus: "SENT",
          esfSentAt: new Date(),
          esfError: null,
        },
      })
      revalidatePath("/admin/documents")
      return { ok: true, regNumber: null, status: "SENT" }
    } finally {
      await closeSession(sessionId, cfg.wsUsername, cfg.wsPassword)
    }
  } catch (e) {
    const message = e instanceof EsfError || e instanceof Error ? e.message : "Не удалось отправить в ИС ЭСФ"
    const raw = e instanceof EsfError ? (e.raw ?? "") : (e instanceof Error ? e.stack ?? "" : "")
    await db.$executeRawUnsafe("INSERT INTO esf_diag (awp_xml, fault_raw) VALUES ($1, $2)", diagXml, raw || message).catch(() => {})
    await db.generatedDocument.update({
      where: { id: documentId },
      data: { esfStatus: "FAILED", esfError: message.slice(0, 500) },
    }).catch(() => {})
    revalidatePath("/admin/documents")
    return { ok: false, error: message }
  }
}

/** Обновить статус ЭСФ (счёта) из ИС ЭСФ + получить рег. номер / причину отказа. */
export async function refreshInvoiceEsfStatus(documentId: string): Promise<
  { ok: true; status: string | null; regNumber: string | null; error?: string | null } | { ok: false; error: string }
> {
  try {
    const { orgId } = await requireStaffAccess()
    const doc = await db.generatedDocument.findFirst({
      where: { id: documentId, organizationId: orgId, documentType: "INVOICE", deletedAt: null },
      select: { id: true, esfId: true },
    })
    if (!doc?.esfId) return { ok: false, error: "Счёт ещё не отправлен в ИС ЭСФ" }

    const org = await db.organization.findUnique({ where: { id: orgId }, select: { bin: true, iin: true } })
    const orgTin = (org?.bin || org?.iin || "").replace(/\D/g, "")
    const cfgRes = await resolveOrgEsfConfig(orgId, orgTin)
    if (!cfgRes.ok) return { ok: false, error: cfgRes.error }
    const cfg = cfgRes.config
    const sessionId = await openEsfSession(cfg)
    try {
      const result = await queryInvoiceSummaryById(sessionId, doc.esfId)
      // FAILED («Ошибочный») / DECLINED («Отклонённый») — тяжёлый ФЛК отклонил
      // ЭСФ после постановки в очередь. Подтягиваем причины и пишем в esf_error.
      let esfError: string | null = null
      if (result.status === "FAILED" || result.status === "DECLINED") {
        const reasons = await queryInvoiceErrorById(sessionId, doc.esfId).catch(() => ({ texts: [] as string[], raw: "" }))
        esfError = reasons.texts.join("; ").slice(0, 500) || null
        // ВРЕМЕННО: сырые ответы КГД (summary + errors) в esf_diag для диагностики.
        await db.$executeRawUnsafe(
          "INSERT INTO esf_diag (awp_xml, fault_raw) VALUES ($1, $2)",
          `STATUS=${result.status}\n${result.raw}`,
          reasons.raw || "(no error body)",
        ).catch(() => {})
      }
      await db.generatedDocument.update({
        where: { id: doc.id },
        data: {
          ...(result.status ? { esfStatus: result.status } : {}),
          ...(result.registrationNumber ? { esfRegNumber: result.registrationNumber } : {}),
          ...(esfError ? { esfError } : {}),
        },
      })
      revalidatePath("/admin/documents")
      return { ok: true, status: result.status, regNumber: result.registrationNumber, error: esfError }
    } finally {
      await closeSession(sessionId, cfg.wsUsername, cfg.wsPassword)
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось получить статус" }
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
    const cfgRes = await resolveOrgEsfConfig(orgId, orgTin)
    if (!cfgRes.ok) return { ok: false, error: cfgRes.error }
    const cfg = cfgRes.config
    const sessionId = await openEsfSession(cfg)
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
      await closeSession(sessionId, cfg.wsUsername, cfg.wsPassword)
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось получить статус" }
  }
}
