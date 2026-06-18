"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { contractScope } from "@/lib/tenant-scope"
import { sendEmail, basicEmailTemplate, htmlEscape } from "@/lib/email"
import { ROOT_HOST } from "@/lib/host"
import { applySignedContractChanges } from "@/lib/contract-addendum"
import { ensureDepositCharge } from "@/lib/deposit"
import { sendSignedContractEmails } from "@/lib/contract-signed-email"
import { autoCreateDocumentsForSignedContract } from "@/lib/auto-documents"
import { headers } from "next/headers"
import { after } from "next/server"
import crypto from "crypto"
import { parseCmsSignature, validateSigner, signerDisplayName } from "@/lib/ncalayer-cms"
import { verifyCmsWithNcanode } from "@/lib/ncanode"
import { contractPayloadBase64, type ContractSigningFields } from "@/lib/contract-signing-payload"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { buildSignedContractDocxBuffer } from "@/lib/contract-engine/signed-docx"
import { buildSignedAddendumDocxBuffer } from "@/lib/contract-engine/signed-addendum-docx"
import { convertDocxToPdf } from "@/lib/pdf-convert"

// Жёсткие предупреждения, при которых подпись отклоняется (а не просто логируется).
const BLOCKING_WARNINGS = ["Срок действия сертификата истёк", "Сертификат ещё не вступил в силу"]

// Срок годности ссылки на подпись (дней с момента отправки арендатору). По истечении
// ссылка не позволяет подписать — нужно переотправить договор. Без отдельной колонки:
// считаем от sentAt. 14 дней — безопаснее долгоживущей ссылки (бэклог аудита 2026-06-10).
const SIGN_LINK_TTL_DAYS = 14
function isSignLinkExpired(sentAt: Date | null | undefined, status: string): boolean {
  if (status === "SIGNED" || status === "REJECTED") return false
  if (!sentAt) return false
  const ageDays = (Date.now() - new Date(sentAt).getTime()) / 86_400_000
  return ageDays > SIGN_LINK_TTL_DAYS
}

interface ContractForSign extends ContractSigningFields {
  id: string
  organizationId: string
}

/** Ожидаемые ИИН/БИН арендодателя (организации) для сверки подписанта. Пусто — если реквизиты неизвестны. */
async function landlordExpectedTaxIds(orgId: string): Promise<string[]> {
  try {
    const req = await getOrganizationRequisites(orgId)
    return [req.bin, req.iin, req.taxId].filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Общая логика записи ЭЦП-подписи договора (для арендатора и арендодателя):
 *  1) разбирает CMS (сертификат подписанта);
 *  2) проверяет срок/издателя;
 *  3) сверяет вложенные в подпись данные с каноническим текстом договора (привязка);
 *  4) пишет DocumentSignature.
 * Возвращает { signatureId, signerName } либо бросает Error с понятным текстом.
 */
async function recordContractEcpSignature(
  contract: ContractForSign,
  cmsB64: string,
  signerUserId: string | null,
  expectedTaxIds: string[] = [],
  opts?: { requireIdentity?: boolean; partyLabel?: string },
): Promise<{ signatureId: string; signerName: string }> {
  const parsed = parseCmsSignature(cmsB64)
  if (!parsed.ok || !parsed.signer) {
    throw new Error(parsed.error ?? "Не удалось разобрать ЭЦП-подпись")
  }
  const signer = parsed.signer

  const warnings = validateSigner(signer)
  const blocking = warnings.filter((w) => BLOCKING_WARNINGS.includes(w))
  if (blocking.length) {
    throw new Error(blocking.join("; "))
  }

  // Привязка: вложенные в CMS данные должны совпадать с текстом договора.
  const expectedB64 = contractPayloadBase64(contract)
  if (parsed.encapsulatedContentB64 && parsed.encapsulatedContentB64 !== expectedB64) {
    throw new Error("Подпись не соответствует тексту договора (возможно, документ изменён)")
  }

  // Сверка личности (ТЗ 17.2.3): ИИН/БИН из сертификата должен совпасть с ожидаемой
  // стороной договора. Сверяем ТОЛЬКО когда ожидаемые реквизиты известны (12 цифр) —
  // если в базе их нет, не блокируем легитимную подпись.
  const expected = expectedTaxIds.map((x) => String(x ?? "").replace(/\D/g, "")).filter((x) => x.length === 12)
  const label = opts?.partyLabel ?? "стороны договора"
  // Строгий режим: реквизиты стороны ОБЯЗАНЫ быть заполнены — иначе сверить личность
  // подписанта не с чем, и подпись недопустима (ТЗ 17.2.3).
  if (opts?.requireIdentity && !expected.length) {
    throw new Error(`Не заполнен ИИН/БИН ${label}: подпись невозможна, пока реквизиты не указаны (нужны для сверки личности подписанта)`)
  }
  if (expected.length) {
    // Для ТОО валиден И БИН организации, И ИИН директора — принимаем оба.
    const got = [signer.iin, signer.bin].filter((x): x is string => !!x)
    if (!got.some((g) => expected.includes(g))) {
      throw new Error(`ЭЦП подписана не той стороной: ИИН/БИН сертификата (${got.join("/") || "не определён"}) не совпадает с реквизитами ${label}. Подписать может только владелец ключа с этим ИИН/БИН.`)
    }
  }

  // Строгая криптопроверка через NCANode (KalkanCrypt): ГОСТ-2015 + цепочка до НУЦ РК
  // + отзыв (OCSP). Включается ТОЛЬКО если NCANode настроен (NCANODE_SECRET) — иначе
  // (dev/preview без верификатора) полагаемся на pure-JS разбор + привязку выше.
  // Метка доверенного времени (TSP, RFC 3161), если NCALayer встроил её в CMS.
  let tspGenTime: Date | null = null
  let tspSerial: string | null = null
  if (process.env.NCANODE_SECRET) {
    const v = await verifyCmsWithNcanode(cmsB64)
    if (!v.valid) {
      throw new Error("ЭЦП не прошла криптопроверку НУЦ РК: " + (v.reason ?? "подпись недействительна"))
    }
    const t = v.signers.find((s) => s.tspGenTime)?.tspGenTime
    if (t) { const d = new Date(t); if (!Number.isNaN(d.getTime())) tspGenTime = d }
    tspSerial = v.signers.find((s) => s.tspSerial)?.tspSerial ?? null
  }

  const signerName = signerDisplayName(signer) ?? "Подписант ЭЦП"
  const signedHashB64 = crypto.createHash("sha256").update(expectedB64, "base64").digest("base64")

  const sig = await db.documentSignature.create({
    data: {
      organizationId: contract.organizationId,
      documentType: "CONTRACT",
      documentId: contract.id,
      signerUserId,
      signerName,
      signerIin: signer.iin ?? null,
      signerOrgBin: signer.bin ?? null,
      signedHashB64,
      signatureB64: cmsB64,
      certPemB64: signer.certDerB64 ?? "",
      validFrom: signer.validFrom ?? null,
      validTo: signer.validTo ?? null,
      algorithm: "GOST/RSA (NCALayer)",
      tspGenTime,
      tspSerial,
    },
    select: { id: true },
  })

  return { signatureId: sig.id, signerName }
}

/**
 * Отправить договор арендатору на подпись.
 * Генерирует уникальный токен → tenant получает email со ссылкой → может
 * прочитать договор и подписать (галочка + ФИО) либо отклонить с причиной.
 */
export async function sendContractForSignature(
  contractId: string,
): Promise<{ ok: true; signUrl: string } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const contract = await db.contract.findFirst({
    where: { id: contractId, ...contractScope(orgId) },
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      signToken: true,
      tenant: {
        select: {
          companyName: true,
          user: { select: { name: true, email: true, phone: true } },
        },
      },
    },
  })
  if (!contract) return { ok: false, error: "Договор не найден или нет доступа" }

  if (contract.status === "SIGNED") {
    return { ok: false, error: "Договор уже подписан обеими сторонами" }
  }
  const documentTitle = contract.type === "ADDENDUM" ? "Дополнительное соглашение" : "Договор"
  const documentTitleLower = contract.type === "ADDENDUM" ? "дополнительное соглашение" : "договор аренды"
  const documentSentPhrase = contract.type === "ADDENDUM"
    ? "Вам направлено дополнительное соглашение"
    : "Вам направлен договор аренды"

  // Регенерируем токен на каждой отправке (старая ссылка протухает)
  const token = crypto.randomBytes(24).toString("hex")
  await db.contract.update({
    where: { id: contractId },
    data: {
      signToken: token,
      sentAt: new Date(),
      status: contract.status === "DRAFT" ? "SENT" : contract.status,
    },
  })

  const h = await headers()
  const proto = h.get("x-forwarded-proto") ?? "https"
  const signUrl = `${proto}://${ROOT_HOST}/sign/${token}`

  // Отправляем email арендатору если есть адрес
  const tenantEmail = contract.tenant.user.email
  if (tenantEmail) {
    try {
      const html = basicEmailTemplate({
        title: `${documentTitle} № ${contract.number} на подпись`,
        body: `<p>Здравствуйте, ${htmlEscape(contract.tenant.user.name)}!</p>
<p>${documentSentPhrase} <b>№ ${htmlEscape(contract.number)}</b> для компании <b>${htmlEscape(contract.tenant.companyName)}</b>.</p>
<p>Откройте ссылку, прочитайте текст и нажмите «Подписать», если согласны с условиями. Если есть вопросы — отклоните документ с пояснением, и мы свяжемся.</p>
<p>Ссылка действительна до момента следующей повторной отправки.</p>`,
        buttonText: `Открыть ${documentTitleLower}`,
        buttonUrl: signUrl,
        footer: "Это автоматическое письмо. Если вы не ожидали этот документ — проигнорируйте письмо.",
      })
      await sendEmail({
        to: tenantEmail,
        subject: `${documentTitle} № ${contract.number} — подпишите онлайн`,
        html,
        text: `${documentTitle} ${contract.number} — откройте ссылку ${signUrl}`,
      })
    } catch (e) {
      console.warn("[contract email] failed:", e instanceof Error ? e.message : e)
    }
  }

  revalidatePath(`/admin/tenants/${session.user.id}`)
  revalidatePath("/admin/documents")
  return { ok: true, signUrl }
}

/**
 * Канонический payload (base64) договора для подписи арендодателем ЭЦП.
 * Используется конструктором: создать договор → получить payload → подписать в NCALayer.
 */
export async function getLandlordSignPayload(
  contractId: string,
): Promise<{ ok: true; payloadB64: string } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()
  const c = await db.contract.findFirst({
    where: { id: contractId, ...contractScope(orgId) },
    select: {
      number: true, type: true, content: true, startDate: true, endDate: true,
      tenant: { select: { companyName: true } },
    },
  })
  if (!c) return { ok: false, error: "Договор не найден" }
  const payloadB64 = contractPayloadBase64({
    number: c.number,
    type: c.type,
    content: c.content,
    startDate: c.startDate,
    endDate: c.endDate,
    tenantCompany: c.tenant.companyName,
  })
  return { ok: true, payloadB64 }
}

/**
 * Отметить договор подписанным со стороны арендодателя (после ЭЦП через
 * NCALayer или ручного подтверждения).
 */
export async function markContractSignedByLandlord(
  contractId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { orgId } = await requireOrgAccess()
  const contract = await db.contract.findFirst({
    where: { id: contractId, ...contractScope(orgId) },
    select: { id: true, status: true, signedByTenantAt: true, sentAt: true },
  })
  if (!contract) return { ok: false, error: "Договор не найден" }

  const now = new Date()
  // Обе стороны → SIGNED. Иначе «SENT» только если договор реально отправлен
  // арендатору (есть sentAt); подпись арендодателя сама по себе ≠ отправка.
  const newStatus = contract.signedByTenantAt ? "SIGNED" : (contract.sentAt ? "SENT" : contract.status)
  await db.contract.update({
    where: { id: contractId },
    data: {
      signedByLandlordAt: now,
      status: newStatus,
      ...(newStatus === "SIGNED" ? { signedAt: now } : {}),
    },
  })
  if (newStatus === "SIGNED") {
    await applySignedContractChanges(contract.id)
    await ensureDepositCharge(contract.id)
    // Подписанный договор уходит на email обеим сторонам после ответа (не блокируем UI).
    after(() => sendSignedContractEmails(contract.id))
    // Конвейер: счёт + АВР за текущий месяц создаются автоматически, владельцу — на подпись.
    after(() => autoCreateDocumentsForSignedContract(contract.id))
  }

  revalidatePath("/admin/documents")
  return { ok: true }
}

// ─── Публичные действия со ссылкой ────────────────────────────────

/**
 * Получить договор по токену (для публичной страницы /sign/[token]).
 * Помечает viewedAt при первом открытии.
 */
export async function getContractByToken(token: string) {
  if (!token || typeof token !== "string" || token.length < 20) return null

  // findFirst + deletedAt:null — soft-delete НЕ перехватывает findUnique (lib/db.ts),
  // поэтому фильтруем явно: удалённый арендодателем договор должен сразу пропасть по ссылке.
  const contract = await db.contract.findFirst({
    where: { signToken: token, deletedAt: null },
    select: {
      id: true,
      number: true,
      type: true,
      content: true,
      // Снимок конструктора — для показа ПОЛНОГО документа (с приложениями) на
      // странице подписи, в т.ч. для старых договоров, где приложений нет в content.
      builderState: true,
      status: true,
      startDate: true,
      endDate: true,
      sentAt: true,
      viewedAt: true,
      signedByTenantAt: true,
      signedByTenantName: true,
      signedByLandlordAt: true,
      rejectedAt: true,
      rejectionReason: true,
      tenant: {
        select: {
          companyName: true,
          legalType: true,
          userId: true,
          user: { select: { name: true, email: true, organizationId: true } },
        },
      },
    },
  })
  if (!contract) return null

  // Отмечаем первое открытие
  if (!contract.viewedAt) {
    await db.contract.update({
      where: { id: contract.id },
      data: { viewedAt: new Date(), status: contract.status === "SENT" ? "VIEWED" : contract.status },
    })
  }
  return { ...contract, signLinkExpired: isSignLinkExpired(contract.sentAt, contract.status) }
}

/**
 * Публичное скачивание подписанного договора по токену (для арендатора) — ТОЛЬКО PDF.
 * Доступно когда договор подписан обеими сторонами (status SIGNED) и не удалён.
 * Рендерим DOCX со штампами ЭЦП → конвертируем в PDF на VPS (LibreOffice).
 */
export async function getSignedContractPdfByToken(
  token: string,
): Promise<{ ok: true; fileName: string; base64: string } | { ok: false; error: string }> {
  if (!token || token.length < 20) return { ok: false, error: "Неверная ссылка" }
  const contract = await db.contract.findFirst({
    where: { signToken: token, deletedAt: null },
    select: {
      id: true, number: true, status: true, type: true, content: true, builderState: true,
      signedByLandlordAt: true, signedByTenantAt: true,
      tenant: { select: { companyName: true, bin: true, iin: true, user: { select: { organizationId: true } } } },
    },
  })
  if (!contract) return { ok: false, error: "Договор не найден" }
  if (contract.status !== "SIGNED") {
    return { ok: false, error: "Скачивание будет доступно после подписи обеих сторон" }
  }
  try {
    // Договор из конструктора → полный рендер по builderState; ДС (текст) → отдельный рендер.
    const docx = contract.builderState
      ? await buildSignedContractDocxBuffer(contract)
      : await buildSignedAddendumDocxBuffer(contract)
    if (!docx) return { ok: false, error: "Документ создан вне конструктора — обратитесь к арендодателю за копией" }
    const num = (contract.number || "doc").replace(/[^\w.-]+/g, "_")
    const pdf = await convertDocxToPdf(docx, `${num}.docx`)
    return { ok: true, fileName: signedContractFileName(contract), base64: pdf.toString("base64") }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сгенерировать PDF" }
  }
}

/** Имя файла: «Договор аренды № 001 — ИП … от 01.06.2026.pdf» / «Доп. соглашение № 001-ДС1 — ….pdf». */
function signedContractFileName(contract: { number: string | null; type: string; builderState: unknown; tenant: { companyName: string } }): string {
  const st = contract.builderState as { tenant?: { name?: string }; meta?: { contractDate?: string } } | null
  const tenantName = String(st?.tenant?.name ?? contract.tenant.companyName ?? "").replace(/[«»"]/g, "").trim()
  let dateStr = ""
  const raw = st?.meta?.contractDate
  if (raw) { const d = new Date(raw); if (!Number.isNaN(d.getTime())) dateStr = d.toLocaleDateString("ru-RU") }
  const kind = contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор аренды"
  const parts = [
    `${kind}${contract.number ? ` № ${contract.number}` : ""}`,
    tenantName,
    dateStr ? `от ${dateStr}` : "",
  ].filter(Boolean)
  const name = parts.join(" — ").replace(/[\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()
  return `${name}.pdf`
}

/**
 * Арендатор подписывает договор.
 */
export async function signContractByTenant(
  token: string,
  signerName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Простая подпись арендатором отключена: договор подписывается ТОЛЬКО
  // квалифицированной ЭЦП НУЦ РК (через NCALayer) — это требование закрывает
  // подпись «любым ФИО без сверки личности». Оставлено как защита на сервере
  // на случай прямого вызова в обход UI.
  void signerName
  if (!token) return { ok: false, error: "Неверная ссылка" }
  return { ok: false, error: "Договор подписывается только через ЭЦП (НУЦ РК). Простая подпись отключена." }
}

/**
 * Арендатор подписывает договор квалифицированной ЭЦП (НУЦ РК) через NCALayer.
 * Публичное действие — доступ по токену (внешний пользователь без сессии).
 * @param cmsB64 base64 CMS-подписи от NCALayer (attached).
 */
export async function signContractByTenantEcp(
  token: string,
  cmsB64: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token || token.length < 20) return { ok: false, error: "Неверная ссылка" }
  if (!cmsB64 || cmsB64.length < 100) return { ok: false, error: "Пустая подпись" }

  const contract = await db.contract.findFirst({
    where: { signToken: token, deletedAt: null },
    select: {
      id: true,
      number: true,
      type: true,
      content: true,
      status: true,
      startDate: true,
      endDate: true,
      sentAt: true,
      signedByLandlordAt: true,
      tenant: {
        select: {
          companyName: true,
          bin: true,
          iin: true,
          user: { select: { organizationId: true } },
        },
      },
    },
  })
  if (!contract) return { ok: false, error: "Договор не найден" }
  if (contract.status === "SIGNED" || contract.status === "REJECTED") {
    return { ok: false, error: "Договор уже завершён" }
  }
  if (isSignLinkExpired(contract.sentAt, contract.status)) {
    return { ok: false, error: `Ссылка на подпись устарела (старше ${SIGN_LINK_TTL_DAYS} дней). Попросите арендодателя отправить договор повторно.` }
  }
  const orgId = contract.tenant.user.organizationId
  if (!orgId) return { ok: false, error: "Договор не привязан к организации" }

  try {
    const { signerName } = await recordContractEcpSignature(
      {
        id: contract.id,
        organizationId: orgId,
        number: contract.number,
        type: contract.type,
        content: contract.content,
        startDate: contract.startDate,
        endDate: contract.endDate,
        tenantCompany: contract.tenant.companyName,
      },
      cmsB64,
      null,
      [contract.tenant.bin ?? "", contract.tenant.iin ?? ""],
      { requireIdentity: true, partyLabel: "арендатора" },
    )

    const now = new Date()
    const newStatus = contract.signedByLandlordAt ? "SIGNED" : "SIGNED_BY_TENANT"
    await db.contract.update({
      where: { id: contract.id },
      data: {
        signedByTenantAt: now,
        signedByTenantName: signerName,
        status: newStatus,
        ...(newStatus === "SIGNED" ? { signedAt: now } : {}),
      },
    })
    if (newStatus === "SIGNED") {
      await applySignedContractChanges(contract.id)
      await ensureDepositCharge(contract.id)
      // Подписанный договор уходит на email обеим сторонам после ответа (не блокируем UI).
      after(() => sendSignedContractEmails(contract.id))
      // Конвейер: счёт + АВР за текущий месяц создаются автоматически, владельцу — на подпись.
      after(() => autoCreateDocumentsForSignedContract(contract.id))
    }

    revalidatePath("/admin/documents")
    revalidatePath("/admin/contracts")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось подписать" }
  }
}

/**
 * Арендодатель подписывает договор квалифицированной ЭЦП (НУЦ РК) через NCALayer.
 * Authed-действие (внутри админки).
 */
export async function signContractByLandlordEcp(
  contractId: string,
  cmsB64: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  if (!cmsB64 || cmsB64.length < 100) return { ok: false, error: "Пустая подпись" }
  const { orgId, userId } = await requireOrgAccess()

  const contract = await db.contract.findFirst({
    where: { id: contractId, ...contractScope(orgId) },
    select: {
      id: true,
      number: true,
      type: true,
      content: true,
      status: true,
      startDate: true,
      endDate: true,
      signedByTenantAt: true,
      sentAt: true,
      tenant: { select: { companyName: true } },
    },
  })
  if (!contract) return { ok: false, error: "Договор не найден или нет доступа" }
  if (contract.status === "SIGNED" || contract.status === "REJECTED") {
    return { ok: false, error: "Договор уже завершён" }
  }

  try {
    await recordContractEcpSignature(
      {
        id: contract.id,
        organizationId: orgId,
        number: contract.number,
        type: contract.type,
        content: contract.content,
        startDate: contract.startDate,
        endDate: contract.endDate,
        tenantCompany: contract.tenant.companyName,
      },
      cmsB64,
      userId,
      await landlordExpectedTaxIds(orgId),
      { requireIdentity: true, partyLabel: "арендодателя (организации)" },
    )

    const now = new Date()
    // «SENT» только если договор реально отправлен арендатору (есть sentAt);
    // подпись арендодателя сама по себе ≠ отправка.
    const newStatus = contract.signedByTenantAt ? "SIGNED" : (contract.sentAt ? "SENT" : contract.status)
    await db.contract.update({
      where: { id: contract.id },
      data: {
        signedByLandlordAt: now,
        status: newStatus,
        ...(newStatus === "SIGNED" ? { signedAt: now } : {}),
      },
    })
    if (newStatus === "SIGNED") {
      await applySignedContractChanges(contract.id)
      await ensureDepositCharge(contract.id)
      // Подписанный договор уходит на email обеим сторонам после ответа (не блокируем UI).
      after(() => sendSignedContractEmails(contract.id))
      // Конвейер: счёт + АВР за текущий месяц создаются автоматически, владельцу — на подпись.
      after(() => autoCreateDocumentsForSignedContract(contract.id))
    }

    revalidatePath(`/admin/contracts/${contract.id}`)
    revalidatePath("/admin/documents")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось подписать" }
  }
}

/**
 * Арендатор отклоняет договор с причиной.
 */
export async function rejectContractByTenant(
  token: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token || token.length < 20) return { ok: false, error: "Неверная ссылка" }
  const r = reason.trim().slice(0, 1000)
  if (r.length < 5) return { ok: false, error: "Опишите причину отказа (минимум 5 символов)" }

  // findFirst + deletedAt: null — soft-delete НЕ перехватывает findUnique (lib/db.ts):
  // удалённый арендодателем договор нельзя отклонить по старой ссылке.
  const contract = await db.contract.findFirst({
    where: { signToken: token, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!contract) return { ok: false, error: "Договор не найден" }
  if (contract.status === "SIGNED" || contract.status === "REJECTED") {
    return { ok: false, error: "Договор уже завершён" }
  }

  await db.contract.update({
    where: { id: contract.id },
    data: {
      rejectedAt: new Date(),
      rejectionReason: r,
      status: "REJECTED",
    },
  })

  revalidatePath("/admin/documents")
  return { ok: true }
}
