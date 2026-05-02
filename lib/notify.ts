import { db } from "@/lib/db"
import { sendTelegram } from "@/lib/telegram"
import { sendEmail, basicEmailTemplate } from "@/lib/email"
import { sendSms } from "@/lib/sms"

export interface NotifyOpts {
  userId: string
  type: string
  title: string
  message: string
  /** Относительная ссылка типа /cabinet/finances или /admin/tenants/xxx */
  link?: string
  /** По умолчанию true */
  sendTelegram?: boolean
  /** По умолчанию true */
  sendEmail?: boolean
  /** По умолчанию false (SMS платное) — true только для критичных уведомлений */
  sendSms?: boolean
  /** Опционально — кастомный HTML письма (иначе генерируем basicEmailTemplate) */
  emailHtml?: string
  /** Текст кнопки в письме (по умолчанию "Открыть в кабинете") */
  emailButtonText?: string
}

/**
 * Универсальный хелпер уведомления:
 *  1. Создаёт запись в notifications (in-app, колокольчик)
 *  2. Шлёт Telegram (если у юзера привязан chat_id)
 *  3. Шлёт email (если у юзера есть email)
 *
 * Не требует сессии — можно вызывать из cron-а и server action-ов.
 * Все каналы независимы: если один упал — остальные продолжают.
 */
export async function notifyUser(opts: NotifyOpts) {
  // 1. In-app
  try {
    await db.notification.create({
      data: {
        userId: opts.userId,
        type: opts.type,
        title: opts.title,
        message: opts.message,
        link: opts.link ?? null,
      },
    })
  } catch (e) {
    console.warn("[notify] in-app create failed:", e instanceof Error ? e.message : e)
  }

  if (opts.sendTelegram === false && opts.sendEmail === false && !opts.sendSms) return

  const user = await db.user.findUnique({
    where: { id: opts.userId },
    select: {
      telegramChatId: true, email: true, phone: true, name: true,
      notifyEmail: true, notifyTelegram: true, notifySms: true,
      notifyMutedTypes: true,
    },
  }).catch(() => null)
  if (!user) return

  // Если этот тип события у юзера в muted — ни telegram, ни email не шлём
  // (in-app уведомление уже создано выше).
  const mutedTypes = Array.isArray(user.notifyMutedTypes)
    ? user.notifyMutedTypes.filter((x): x is string => typeof x === "string")
    : []
  const isMuted = mutedTypes.includes(opts.type)

  // 2. Telegram
  if (opts.sendTelegram !== false && user.telegramChatId && (user.notifyTelegram ?? true) && !isMuted) {
    try {
      await sendTelegram(user.telegramChatId, `<b>${opts.title}</b>\n\n${opts.message}`)
    } catch (e) {
      console.warn("[notify] telegram failed:", e instanceof Error ? e.message : e)
    }
  }

  // 3. Email
  if (opts.sendEmail !== false && user.email && (user.notifyEmail ?? true) && !isMuted) {
    try {
      const rootHost = process.env.ROOT_HOST || "commrent.kz"
      const fullLink = opts.link
        ? `https://${rootHost}${opts.link.startsWith("/") ? "" : "/"}${opts.link}`
        : undefined

      const html = opts.emailHtml ?? basicEmailTemplate({
        title: opts.title,
        body: `<p>Здравствуйте, ${user.name}!</p><p>${opts.message}</p>`,
        buttonText: fullLink ? (opts.emailButtonText ?? "Открыть в кабинете") : undefined,
        buttonUrl: fullLink,
      })

      const subject = `Commrent · ${opts.title}`
      const result = await sendEmail({
        to: user.email,
        subject,
        html,
        text: `${opts.title}\n\n${opts.message}${fullLink ? `\n\n${fullLink}` : ""}`,
      })

      // Лог в email_logs (best-effort, не блокирует если таблица не создана)
      try {
        await db.emailLog.create({
          data: {
            recipient: user.email,
            subject,
            type: opts.type,
            userId: opts.userId,
            externalId: result.id,
            status: result.ok ? "SENT" : "FAILED",
            error: result.error,
          },
        })
      } catch {}
    } catch (e) {
      console.warn("[notify] email failed:", e instanceof Error ? e.message : e)
    }
  }

  // 4. SMS (только если явно запрошено и пользователь его включил)
  if (opts.sendSms && user.phone && (user.notifySms ?? false) && !isMuted) {
    try {
      const rootHost = process.env.ROOT_HOST || "commrent.kz"
      const linkPart = opts.link ? ` https://${rootHost}${opts.link}` : ""
      // SMS дороже за длину: укорачиваем до 160 (1 сегмент латиницей или 70 кириллицей)
      const text = `${opts.title}: ${opts.message}${linkPart}`.replace(/\s+/g, " ").slice(0, 320)
      await sendSms(user.phone, text)
    } catch (e) {
      console.warn("[notify] sms failed:", e instanceof Error ? e.message : e)
    }
  }
}
