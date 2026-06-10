import "server-only"
import { db } from "@/lib/db"
import { sendEmail, basicEmailTemplate, htmlEscape } from "@/lib/email"
import { convertDocxToPdf, pdfConvertConfigured } from "@/lib/pdf-convert"
import { notifyUser } from "@/lib/notify"

const DOC_TYPE_LABEL: Record<string, string> = {
  INVOICE: "Счёт на оплату",
  ACT: "Акт выполненных работ",
  RECONCILIATION: "Акт сверки",
  HANDOVER: "Акт приёма-передачи",
}

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

    const label = DOC_TYPE_LABEL[doc.documentType] ?? "Документ"
    const numberLabel = doc.number ? ` № ${doc.number}` : ""
    const periodLabel = doc.period ? ` за ${doc.period}` : ""

    // Уведомление в кабинете (best-effort).
    await notifyUser({
      userId: tenant.user.id,
      type: "DOCUMENT_SIGN_REQUEST",
      title: `${label}${numberLabel} от арендодателя`,
      message: `${label}${numberLabel}${periodLabel} подписан арендодателем и доступен в кабинете → Документы.`,
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

    const result = await sendEmail({
      to: email,
      subject: `${label}${numberLabel}${periodLabel}`,
      html: basicEmailTemplate({
        title: `${label}${numberLabel}`,
        body: `<p>Здравствуйте, ${htmlEscape(tenant.user.name)}!</p>
<p>Арендодатель подписал и направил вам документ: <b>${htmlEscape(label)}${htmlEscape(numberLabel)}${htmlEscape(periodLabel)}</b>${typeof doc.totalAmount === "number" && doc.totalAmount > 0 ? ` на сумму <b>${doc.totalAmount.toLocaleString("ru-RU")} ₸</b>` : ""}.</p>
<p>Документ во вложении. Он также доступен в личном кабинете в разделе «Документы».</p>`,
        footer: "Это автоматическое письмо системы управления арендой.",
      }),
      text: `${label}${numberLabel}${periodLabel} подписан арендодателем. Документ во вложении и в кабинете → Документы.`,
      attachments: [attachment],
    })
    if (!result.ok) {
      console.warn(`[document-delivery] письмо не отправлено (${label}${numberLabel}):`, result.error)
    }
  } catch (e) {
    console.warn("[document-delivery] ошибка:", e instanceof Error ? e.message : e)
  }
}
