import { NextResponse } from "next/server"
import { getT } from "@/lib/i18n/server"
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import { db } from "@/lib/db"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { sendEmail, basicEmailTemplate, htmlEscape } from "@/lib/email"

export const dynamic = "force-dynamic"

// Ежедневный cron в 09:00 UTC (≈14:00 Алматы) — оптимальное время для email.
// Шлёт reminder арендатору за 3, 1, 0 дней до dueDate каждого неоплаченного charge.
//
// Soft-delete: extension в lib/db автоматически фильтрует Charge.deletedAt = null,
// так что удалённые начисления не получат напоминание.


export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Подпись «через 3 дня / завтра / сегодня» — ключ словаря: письмо уходит
  // на языке получателя, а не на языке того, кто запустил задачу.
  const targets = [
    { days: 3, key: "in3days" },
    { days: 1, key: "tomorrow" },
    { days: 0, key: "today" },
  ] as const

  const stats = { sent: 0, failed: 0, skipped: 0 }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""

  for (const target of targets) {
    const dueStart = new Date(today)
    dueStart.setDate(dueStart.getDate() + target.days)
    const dueEnd = new Date(dueStart)
    dueEnd.setDate(dueEnd.getDate() + 1)

    const charges = await db.charge.findMany({
      where: {
        isPaid: false,
        dueDate: { gte: dueStart, lt: dueEnd },
      },
      include: {
        tenant: { include: { user: true } },
      },
    })

    for (const charge of charges) {
      const user = charge.tenant.user
      if (!user?.email || !user.notifyEmail) {
        stats.skipped++
        continue
      }

      const locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE
      const { t } = await getT(locale)
      const when = t(`emails.reminder.when.${target.key}` as Parameters<typeof t>[0])
      const amount = formatMoneyL(locale, charge.amount)

      const chargeTypeKey = `domain.chargeTypes.${charge.type}` as Parameters<typeof t>[0]
      const chargeTypeLabel = t(chargeTypeKey)
      // Неизвестный код показываем как есть: в письме это виднее ключа словаря.
      const safeType = htmlEscape(chargeTypeLabel === chargeTypeKey ? charge.type : chargeTypeLabel)
      const safePeriod = htmlEscape(charge.period)
      const safeAmount = htmlEscape(amount)
      const safeDue = htmlEscape(charge.dueDate ? formatDateShortL(locale, charge.dueDate) : "—")

      const html = basicEmailTemplate({
        lang: locale,
        title: t("emails.reminder.title", { when }),
        body: `<p>${htmlEscape(t("emails.reminder.greeting"))}</p>
<p>${htmlEscape(t("emails.reminder.lead", { when }))}</p>
<ul>
  <li><strong>${htmlEscape(t("emails.reminder.period"))}:</strong> ${safePeriod}</li>
  <li><strong>${htmlEscape(t("emails.reminder.type"))}:</strong> ${safeType}</li>
  <li><strong>${htmlEscape(t("emails.reminder.amount"))}:</strong> ${safeAmount}</li>
  <li><strong>${htmlEscape(t("emails.reminder.due"))}:</strong> ${safeDue}</li>
</ul>`,
        buttonText: t("emails.common.openCabinet"),
        buttonUrl: `${appUrl}/cabinet/finances`,
        footer: t("emails.reminder.footer"),
      })

      const result = await sendEmail({
        to: user.email,
        subject: t("emails.reminder.subject", { when }),
        html,
        text: t("emails.reminder.text", { when, amount, period: charge.period }),
      })

      if (result.ok) stats.sent++
      else stats.failed++
    }
  }

  return NextResponse.json({ ok: true, ...stats, ranAt: new Date().toISOString() })
}
