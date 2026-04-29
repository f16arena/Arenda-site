import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendTelegram } from "@/lib/telegram"

export const dynamic = "force-dynamic"

// Webhook от Telegram. URL: https://commrent.kz/api/telegram/webhook
// Регистрируется через /api/telegram/setup

interface TelegramMessage {
  message_id: number
  from?: { id: number; first_name?: string; username?: string }
  chat: { id: number; first_name?: string; username?: string; type: string }
  text?: string
  date: number
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

export async function POST(req: Request) {
  // Проверка секретного токена (если задан)
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expectedSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token")
    if (got !== expectedSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  let update: TelegramUpdate
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const msg = update.message
  if (!msg) return NextResponse.json({ ok: true })

  const chatId = String(msg.chat.id)
  const text = (msg.text ?? "").trim()
  const userName = msg.from?.first_name ?? msg.chat.first_name ?? "Пользователь"

  // /start — приветствие + отправить chat_id
  if (text.startsWith("/start")) {
    await sendTelegram(chatId,
      `👋 Привет, <b>${userName}</b>!\n\n` +
      `Это бот <b>Commrent</b> — платформа управления коммерческой арендой.\n\n` +
      `🆔 Ваш Chat ID: <code>${chatId}</code>\n\n` +
      `<b>Что делать дальше:</b>\n` +
      `1. Скопируйте Chat ID выше\n` +
      `2. Откройте https://commrent.kz/login\n` +
      `3. Войдите → Мой профиль → вставьте Chat ID\n\n` +
      `После этого вы будете получать уведомления:\n` +
      `• ⏰ За 20 дней до окончания договора\n` +
      `• 💳 За 10 дней до даты оплаты\n` +
      `• 🚨 При просрочках\n` +
      `• 📩 Объявления от администрации\n\n` +
      `Команды:\n` +
      `/help — справка\n` +
      `/myid — показать Chat ID\n` +
      `/status — мой текущий статус`
    )
    return NextResponse.json({ ok: true })
  }

  // /help
  if (text.startsWith("/help")) {
    await sendTelegram(chatId,
      `<b>📋 Команды:</b>\n\n` +
      `/start — приветствие и Chat ID\n` +
      `/myid — показать ваш Chat ID\n` +
      `/status — статус подключения и непрочитанные уведомления\n` +
      `/help — эта справка\n\n` +
      `🌐 Сайт: https://commrent.kz`
    )
    return NextResponse.json({ ok: true })
  }

  // /myid
  if (text.startsWith("/myid")) {
    await sendTelegram(chatId, `🆔 Ваш Chat ID: <code>${chatId}</code>`)
    return NextResponse.json({ ok: true })
  }

  // /status — проверка подключения
  if (text.startsWith("/status")) {
    try {
      const user = await db.user.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true, name: true, role: true },
      })
      if (!user) {
        await sendTelegram(chatId,
          `❌ Этот Telegram не подключён к аккаунту Commrent.\n\n` +
          `Для подключения:\n` +
          `1. Скопируйте ваш Chat ID: <code>${chatId}</code>\n` +
          `2. Откройте https://commrent.kz/login\n` +
          `3. Войдите → Мой профиль → вставьте Chat ID`
        )
      } else {
        const unread = await db.notification.count({
          where: { userId: user.id, isRead: false },
        })
        const roleLabels: Record<string, string> = {
          OWNER: "Владелец", ADMIN: "Админ", ACCOUNTANT: "Бухгалтер",
          FACILITY_MANAGER: "Завхоз", TENANT: "Арендатор",
        }
        await sendTelegram(chatId,
          `✅ Подключён как <b>${user.name}</b>\n` +
          `Роль: ${roleLabels[user.role] ?? user.role}\n` +
          `Непрочитанных уведомлений: <b>${unread}</b>\n\n` +
          `🌐 https://commrent.kz`
        )
      }
    } catch (e) {
      await sendTelegram(chatId, `⚠️ Ошибка: ${e instanceof Error ? e.message : "неизвестная"}`)
    }
    return NextResponse.json({ ok: true })
  }

  // Любое другое сообщение — подсказка
  await sendTelegram(chatId,
    `🤖 Я бот Commrent и пока умею только отправлять уведомления.\n\n` +
    `Для управления арендой используйте сайт:\n` +
    `https://commrent.kz\n\n` +
    `Команды: /help`
  )

  return NextResponse.json({ ok: true })
}
