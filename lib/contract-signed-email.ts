import "server-only"
import { db } from "@/lib/db"
import { sendEmail, basicEmailTemplate, htmlEscape } from "@/lib/email"
import { buildSignedContractDocxBuffer } from "@/lib/contract-engine/signed-docx"
import { buildSignedAddendumDocxBuffer } from "@/lib/contract-engine/signed-addendum-docx"
import { convertDocxToPdf } from "@/lib/pdf-convert"

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
            user: { select: { name: true, email: true, organizationId: true } },
          },
        },
      },
    })
    if (!contract || contract.status !== "SIGNED") return

    // Получатели: арендатор + арендодатель (без дублей, без пустых).
    const recipients = new Set<string>()
    const tenantEmail = contract.tenant.user.email?.trim()
    if (tenantEmail) recipients.add(tenantEmail.toLowerCase())

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
        recipients.add(orgEmail.toLowerCase())
      } else if (org?.ownerUserId) {
        const owner = await db.user.findUnique({
          where: { id: org.ownerUserId },
          select: { email: true },
        })
        if (owner?.email?.trim()) recipients.add(owner.email.trim().toLowerCase())
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

    const baseName = signedContractBaseName(contract)
    let attachment: { filename: string; content: Buffer }
    try {
      const pdf = await convertDocxToPdf(docx, `${baseName.replace(/[^\w.-]+/g, "_")}.docx`)
      attachment = { filename: `${baseName}.pdf`, content: pdf }
    } catch (e) {
      console.warn("[signed-contract email] PDF-конвертация не удалась, вкладываю DOCX:", e instanceof Error ? e.message : e)
      attachment = { filename: `${baseName}.docx`, content: docx }
    }

    const documentTitle = contract.type === "ADDENDUM" ? "Дополнительное соглашение" : "Договор аренды"
    const numberLabel = contract.number ? ` № ${contract.number}` : ""
    const signedDate = (contract.signedAt ?? new Date()).toLocaleDateString("ru-RU")
    const verifyUrl = `https://commrent.kz/verify/${contract.id}`
    const partiesLine = [orgName, contract.tenant.companyName].filter(Boolean).map(htmlEscape).join(" и ")

    // Каждой стороне — отдельное письмо (получатели не видят адреса друг друга).
    for (const recipient of recipients) {
      const result = await sendEmail({
        to: recipient,
        subject: `${documentTitle}${numberLabel} подписан обеими сторонами`,
        html: basicEmailTemplate({
          title: `${documentTitle}${numberLabel} подписан`,
          body: `<p>Здравствуйте!</p>
<p>${htmlEscape(documentTitle)} <b>${htmlEscape(numberLabel.trim() || "—")}</b>${partiesLine ? ` между ${partiesLine}` : ""} подписан обеими сторонами ${htmlEscape(signedDate)}.</p>
<p>Подписанный документ со штампами ЭЦП — во вложении. Подлинность подписей можно проверить по ссылке ниже.</p>`,
          buttonText: "Проверить подлинность",
          buttonUrl: verifyUrl,
          footer: "Это автоматическое письмо. Документ юридически значим — сохраните его.",
        }),
        text: `${documentTitle}${numberLabel} подписан обеими сторонами ${signedDate}. Подписанный документ во вложении. Проверка подлинности: ${verifyUrl}`,
        attachments: [attachment],
      })
      if (!result.ok) {
        console.warn(`[signed-contract email] не отправлено на ${recipient} (договор ${contract.number ?? contract.id}):`, result.error)
      }
    }
  } catch (e) {
    console.warn("[signed-contract email] ошибка:", e instanceof Error ? e.message : e)
  }
}

/** Имя файла без расширения: «Договор аренды № 001 — ИП … от 01.06.2026». */
function signedContractBaseName(contract: {
  number: string | null
  type: string
  builderState: unknown
  tenant: { companyName: string }
}): string {
  const st = contract.builderState as { tenant?: { name?: string }; meta?: { contractDate?: string } } | null
  const tenantName = String(st?.tenant?.name ?? contract.tenant.companyName ?? "").replace(/[«»"]/g, "").trim()
  let dateStr = ""
  const raw = st?.meta?.contractDate
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) dateStr = d.toLocaleDateString("ru-RU")
  }
  const kind = contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор аренды"
  const parts = [
    `${kind}${contract.number ? ` № ${contract.number}` : ""}`,
    tenantName,
    dateStr ? `от ${dateStr}` : "",
  ].filter(Boolean)
  return parts.join(" — ").replace(/[\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()
}
