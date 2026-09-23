import "server-only"
import { db } from "@/lib/db"
import { sendEmail, basicEmailTemplate, htmlEscape } from "@/lib/email"
import { buildSignedContractDocxBuffer } from "@/lib/contract-engine/signed-docx"
import { buildSignedAddendumDocxBuffer } from "@/lib/contract-engine/signed-addendum-docx"
import { convertDocxToPdf } from "@/lib/pdf-convert"
import { getTForUser } from "@/lib/i18n/server"
import { formatDateShortL } from "@/lib/i18n/format"
import type { Locale } from "@/lib/i18n/config"
import type { getT } from "@/lib/i18n/server"

/** Переводчик передаётся параметром: помощник сессию сам не читает. */
type Tr = Awaited<ReturnType<typeof getT>>["t"]

/**
 * Рассылает подписанный договор (PDF со штампами ЭЦП) обеим сторонам после того,
 * как договор перешёл в SIGNED: арендатору (email пользователя) и арендодателю
 * (email организации, fallback — email владельца организации).
 *
 * Никогда не бросает: подписание уже состоялось, письмо — побочный эффект.
 * Если PDF-конвертер недоступен (PDF_CONVERT_URL), вкладываем DOCX — документ
 * всё равно должен дойти до сторон.
 */
export async function sendSignedContractEmails(contractId: string): Promise<void> {
  try {
    const contract = await db.contract.findFirst({
      where: { id: contractId, deletedAt: null },
      select: {
        id: true,
        number: true,
        type: true,
        content: true,
        builderState: true,
        status: true,
        signedAt: true,
        signedByLandlordAt: true,
        signedByTenantAt: true,
        tenant: {
          select: {
            companyName: true,
            bin: true,
            iin: true,
            user: { select: { id: true, name: true, email: true, organizationId: true } },
          },
        },
      },
    })
    if (!contract || contract.status !== "SIGNED") return

    // Получатели: арендатор + арендодатель (без дублей, без пустых).
    // Рядом с адресом храним userId — по нему берётся язык письма: арендатор и
    // арендодатель могут читать на разных языках, письмо у каждого своё.
    const recipients = new Map<string, string | null>()
    const tenantEmail = contract.tenant.user.email?.trim()
    if (tenantEmail) recipients.set(tenantEmail.toLowerCase(), contract.tenant.user.id)

    const orgId = contract.tenant.user.organizationId
    let orgName = ""
    if (orgId) {
      const org = await db.organization.findUnique({
        where: { id: orgId },
        select: { name: true, legalName: true, email: true, ownerUserId: true },
      })
      orgName = org?.legalName?.trim() || org?.name?.trim() || ""
      const orgEmail = org?.email?.trim()
      if (orgEmail) {
        // Ящик организации может быть общим, владельца за ним нет — язык по
        // профилю владельца, если он известен.
        recipients.set(orgEmail.toLowerCase(), org?.ownerUserId ?? null)
      } else if (org?.ownerUserId) {
        const owner = await db.user.findUnique({
          where: { id: org.ownerUserId },
          select: { email: true },
        })
        if (owner?.email?.trim()) recipients.set(owner.email.trim().toLowerCase(), org.ownerUserId)
      }
    }
    if (recipients.size === 0) {
      console.warn(`[signed-contract email] нет email ни у одной стороны (договор ${contract.number ?? contract.id})`)
      return
    }

    // Договор из конструктора → полный рендер по builderState; ДС (текст) → отдельный рендер.
    const docx = contract.builderState
      ? await buildSignedContractDocxBuffer(contract)
      : await buildSignedAddendumDocxBuffer(contract)
    if (!docx) {
      console.warn(`[signed-contract email] документ создан вне конструктора, вложение недоступно (договор ${contract.number ?? contract.id})`)
      return
    }

    // PDF/DOCX один для всех — различается только имя файла, оно на языке
    // получателя, поэтому конвертируем один раз, а имя подставляем в цикле.
    let content = docx
    let ext = "docx"
    try {
      content = await convertDocxToPdf(docx, "signed-contract.docx")
      ext = "pdf"
    } catch (e) {
      console.warn("[signed-contract email] PDF-конвертация не удалась, вкладываю DOCX:", e instanceof Error ? e.message : e)
    }

    const verifyUrl = `https://commrent.kz/verify/${contract.id}`

    // Каждой стороне — отдельное письмо (получатели не видят адреса друг друга).
    for (const [recipient, recipientUserId] of recipients) {
      const { t, locale } = await getTForUser(recipientUserId)
      const doc = contract.type === "ADDENDUM"
        ? t("emails.signedContract.docAddendum")
        : t("emails.signedContract.docContract")
      const numberLabel = contract.number
        ? t("emails.signedContract.numberPart", { number: contract.number })
        : ""
      const signedDate = formatDateShortL(locale, contract.signedAt ?? new Date())
      const parties = [orgName, contract.tenant.companyName]
        .filter(Boolean)
        .map(htmlEscape)
        .join(t("emails.signedContract.partiesJoin"))
      const bodyVars = {
        doc: htmlEscape(doc),
        number: htmlEscape(numberLabel.trim() || "—"),
        parties,
        date: htmlEscape(signedDate),
      }
      const baseName = signedContractBaseName(contract, t, locale)

      const result = await sendEmail({
        to: recipient,
        subject: t("emails.signedContract.subject", { doc, number: numberLabel }),
        html: basicEmailTemplate({
          lang: locale,
          title: t("emails.signedContract.title", { doc, number: numberLabel }),
          body: `<p>${htmlEscape(t("emails.common.greeting"))}</p>
<p>${parties ? t("emails.signedContract.bodyParties", bodyVars) : t("emails.signedContract.bodyNoParties", bodyVars)}</p>
<p>${htmlEscape(t("emails.signedContract.attachmentNote"))}</p>`,
          buttonText: t("emails.signedContract.verifyButton"),
          buttonUrl: verifyUrl,
          footer: t("emails.signedContract.footer"),
        }),
        text: t("emails.signedContract.text", { doc, number: numberLabel, date: signedDate, url: verifyUrl }),
        attachments: [{ filename: `${baseName}.${ext}`, content }],
      })
      if (!result.ok) {
        console.warn(`[signed-contract email] не отправлено на ${recipient} (договор ${contract.number ?? contract.id}):`, result.error)
      }
    }
  } catch (e) {
    console.warn("[signed-contract email] ошибка:", e instanceof Error ? e.message : e)
  }
}

/**
 * Имя файла без расширения: «Договор аренды № 001 — ИП … от 01.06.2026».
 * Переводчик и язык приходят параметрами — имя видит получатель письма.
 */
function signedContractBaseName(
  contract: {
    number: string | null
    type: string
    builderState: unknown
    tenant: { companyName: string }
  },
  t: Tr,
  locale: Locale,
): string {
  const st = contract.builderState as { tenant?: { name?: string }; meta?: { contractDate?: string } } | null
  const tenantName = String(st?.tenant?.name ?? contract.tenant.companyName ?? "").replace(/[«»"]/g, "").trim()
  let datePart = ""
  const raw = st?.meta?.contractDate
  if (raw) {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) {
      datePart = t("emails.signedContract.fileDatePart", { date: formatDateShortL(locale, parsed) })
    }
  }
  const kind = contract.type === "ADDENDUM"
    ? t("emails.signedContract.fileAddendum")
    : t("emails.signedContract.fileContract")
  const parts = [
    `${kind}${contract.number ? ` № ${contract.number}` : ""}`,
    tenantName,
    datePart,
  ].filter(Boolean)
  return parts.join(" — ").replace(/[\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()
}
