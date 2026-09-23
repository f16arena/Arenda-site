import "server-only"
import { db } from "@/lib/db"
import { sendEmail, basicEmailTemplate, htmlEscape } from "@/lib/email"
import { convertDocxToPdf, pdfConvertConfigured } from "@/lib/pdf-convert"
import { notifyUser } from "@/lib/notify"
import { getTForUser } from "@/lib/i18n/server"
import { formatMoneyL } from "@/lib/i18n/format"

const DOC_TYPES = new Set(["INVOICE", "ACT", "RECONCILIATION", "HANDOVER"])

/**
 * Доставка сгенерированного документа арендатору после подписи арендодателем:
 * email с PDF (fallback — DOCX) + уведомление в кабинете. Вызывается из
 * saveSignature, когда владелец подписал счёт/АВР/акт сверки ЭЦП.
 * Никогда не бросает.
 */
export async function sendGeneratedDocumentToTenant(documentId: string): Promise<void> {
  try {
    const doc = await db.generatedDocument.findFirst({
      where: { id: documentId, deletedAt: null },
      select: {
        id: true, documentType: true, number: true, period: true,
        fileName: true, fileBytes: true, format: true, tenantId: true, totalAmount: true,
      },
    })
    if (!doc?.tenantId) return
    const tenant = await db.tenant.findUnique({
      where: { id: doc.tenantId },
      select: { companyName: true, user: { select: { id: true, name: true, email: true } } },
    })
    if (!tenant?.user) return

    // Письмо и уведомление читает АРЕНДАТОР — язык берём из его профиля,
    // а не из cookie владельца, который нажал «подписать».
    const { t, locale } = await getTForUser(tenant.user.id)
    const typeKey = DOC_TYPES.has(doc.documentType) ? doc.documentType : "OTHER"
    const label = t(`emails.document.types.${typeKey}` as Parameters<typeof t>[0])
    const numberLabel = doc.number ? t("emails.document.numberPart", { number: doc.number }) : ""
    const periodLabel = doc.period ? t("emails.document.periodPart", { period: doc.period }) : ""

    // Уведомление в кабинете (best-effort).
    await notifyUser({
      userId: tenant.user.id,
      type: "DOCUMENT_SIGN_REQUEST",
      title: t("emails.document.notifyTitle", { label, number: numberLabel }),
      message: t("emails.document.notifyMessage", { label, number: numberLabel, period: periodLabel }),
      link: "/cabinet/documents",
      sendEmail: false,
    }).catch(() => {})

    const email = tenant.user.email?.trim()
    if (!email) return

    // Вложение: PDF, при недоступном конвертере — исходный DOCX.
    const source: Buffer = Buffer.from(doc.fileBytes as unknown as Uint8Array)
    let attachment: { filename: string; content: Buffer } = { filename: doc.fileName, content: source }
    if (doc.format === "DOCX" && pdfConvertConfigured()) {
      try {
        const pdf = await convertDocxToPdf(source, doc.fileName)
        attachment = { filename: doc.fileName.replace(/\.docx$/i, "") + ".pdf", content: pdf }
      } catch (e) {
        console.warn("[document-delivery] PDF-конвертация не удалась, отправляю DOCX:", e instanceof Error ? e.message : e)
      }
    }

    const hasAmount = typeof doc.totalAmount === "number" && doc.totalAmount > 0
    const bodyVars = {
      label: htmlEscape(label),
      number: htmlEscape(numberLabel),
      period: htmlEscape(periodLabel),
      amount: hasAmount ? formatMoneyL(locale, doc.totalAmount as number) : "",
    }

    const result = await sendEmail({
      to: email,
      subject: t("emails.document.subject", { label, number: numberLabel, period: periodLabel }),
      html: basicEmailTemplate({
        lang: locale,
        title: t("emails.document.title", { label, number: numberLabel }),
        body: `<p>${htmlEscape(t("emails.common.greetingNamed", { name: tenant.user.name }))}</p>
<p>${hasAmount ? t("emails.document.bodyWithAmount", bodyVars) : t("emails.document.body", bodyVars)}</p>
<p>${htmlEscape(t("emails.document.attachmentNote"))}</p>`,
        footer: t("emails.common.autoFooter"),
      }),
      text: t("emails.document.text", { label, number: numberLabel, period: periodLabel }),
      attachments: [attachment],
    })
    if (!result.ok) {
      console.warn(`[document-delivery] письмо не отправлено (${label}${numberLabel}):`, result.error)
    }
  } catch (e) {
    console.warn("[document-delivery] ошибка:", e instanceof Error ? e.message : e)
  }
}
