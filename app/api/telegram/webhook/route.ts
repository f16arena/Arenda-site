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

  // /start <token> — авто-привязка через одноразовый токен из профиля
  // /start без токена — приветствие
  if (text.startsWith("/start")) {
    const parts = text.split(/\s+/)
    const startToken = parts[1]?.trim() ?? null

    if (startToken) {
      try {
        const tok = await db.verificationToken.findUnique({
          where: { token: startToken },
          select: { id: true, userId: true, type: true, usedAt: true, expiresAt: true },
        })

        if (!tok || tok.type !== "TELEGRAM_CONNECT") {
          await sendTelegram(chatId, `❌ Ссылка недействительна. Сгенерируйте новую в /admin/profile → Уведомления.`)
          return NextResponse.json({ ok: true })
        }
        if (tok.usedAt) {
          await sendTelegram(chatId, `❌ Эта ссылка уже использована.`)
          return NextResponse.json({ ok: true })
        }
        if (tok.expiresAt < new Date()) {
          await sendTelegram(chatId, `❌ Срок действия ссылки истёк. Сгенерируйте новую в кабинете.`)
          return NextResponse.json({ ok: true })
        }
        if (!tok.userId) {
          await sendTelegram(chatId, `❌ Ошибка: токен без пользователя.`)
          return NextResponse.json({ ok: true })
        }

        const user = await db.user.findUnique({
          where: { id: tok.userId },
          select: { name: true, role: true },
        })

        await db.$transaction([
          db.user.update({
            where: { id: tok.userId },
            data: { telegramChatId: chatId },
          }),
          db.verificationToken.update({
            where: { id: tok.id },
            data: { usedAt: new Date() },
          }),
        ])

        await sendTelegram(chatId,
          `✅ Telegram подключён к аккаунту <b>${user?.name ?? "—"}</b>!\n\n` +
          `Теперь вы будете получать уведомления:\n` +
          `• ⏰ Истечение договора\n` +
          `• 💳 Платежи и просрочки\n` +
          `• 📩 Сообщения и заявки\n\n` +
          `Команды: /help · /status · /myid`
        )
      } catch (e) {
        await sendTelegram(chatId, `⚠️ Ошибка привязки: ${e instanceof Error ? e.message : "неизвестная"}`)
      }
      return NextResponse.json({ ok: true })
    }

    await sendTelegram(chatId,
      `👋 Привет, <b>${userName}</b>!\n\n` +
      `Это бот <b>Commrent</b> — платформа управления коммерческой арендой.\n\n` +
      `🆔 Ваш Chat ID: <code>${chatId}</code>\n\n` +
      `<b>Подключиться автоматически:</b>\n` +
      `1. Откройте https://commrent.kz/admin/profile (таб Уведомления)\n` +
      `2. Нажмите «Подключить Telegram» — получите ссылку\n` +
      `3. Откройте её — Telegram свяжется автоматически\n\n` +
      `<b>Или вручную:</b>\n` +
      `Скопируйте Chat ID выше, вставьте в профиле.\n\n` +
      `После подключения вы будете получать уведомления:\n` +
      `• ⏰ Истечение договора · 💳 Платежи · 🚨 Просрочки · 📩 Объявления\n\n` +
      `Команды: /help · /status · /myid`
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
      `/balance — текущая задолженность арендатора\n` +
      `/submit_meter &lt;тип&gt; &lt;показание&gt; — подать показание счётчика\n` +
      `   тип: electricity / water / heat\n` +
      `/help — эта справка\n\n` +
      `🌐 Сайт: https://commrent.kz`
    )
    return NextResponse.json({ ok: true })
  }

  // /balance — текущая задолженность для арендатора, привязанного к этому Telegram
  if (text.startsWith("/balance")) {
    try {
      const user = await db.user.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true, role: true, name: true },
      })
      if (!user) {
        await sendTelegram(chatId, `❌ Telegram не привязан к аккаунту. Откройте /admin/profile или /cabinet/profile, чтобы подключить.`)
        return NextResponse.json({ ok: true })
      }
      const tenant = await db.tenant.findUnique({
        where: { userId: user.id },
        select: {
          id: true,
          companyName: true,
          charges: {
            where: { isPaid: false },
            select: { id: true, type: true, amount: true, period: true, dueDate: true },
            orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
            take: 10,
          },
        },
      })
      if (!tenant) {
        await sendTelegram(chatId, `ℹ️ Этот аккаунт не привязан как арендатор. Команда /balance работает только для арендаторов.`)
        return NextResponse.json({ ok: true })
      }
      if (tenant.charges.length === 0) {
        await sendTelegram(chatId, `✅ Долг отсутствует — все начисления оплачены.\n\nКомпания: <b>${tenant.companyName}</b>`)
        return NextResponse.json({ ok: true })
      }
      const total = tenant.charges.reduce((s, c) => s + c.amount, 0)
      const lines = tenant.charges.slice(0, 5).map((c) =>
        `• ${c.period} · ${c.type} — ${Math.round(c.amount).toLocaleString("ru-RU")} ₸`
      ).join("\n")
      const more = tenant.charges.length > 5 ? `\n…и ещё ${tenant.charges.length - 5}` : ""
      await sendTelegram(chatId,
        `💳 <b>Задолженность:</b> ${Math.round(total).toLocaleString("ru-RU")} ₸\n` +
        `Компания: <b>${tenant.companyName}</b>\n\n` +
        `Открытые начисления:\n${lines}${more}\n\n` +
        `🌐 Подробнее: https://commrent.kz/cabinet/finances`
      )
    } catch (e) {
      await sendTelegram(chatId, `⚠️ Ошибка получения баланса: ${e instanceof Error ? e.message : "неизвестная"}`)
    }
    return NextResponse.json({ ok: true })
  }

  // /submit_meter <тип> <показание>
  if (text.startsWith("/submit_meter")) {
    try {
      const args = text.slice("/submit_meter".length).trim().split(/\s+/).filter(Boolean)
      const TYPE_MAP: Record<string, string> = {
        electricity: "ELECTRICITY", свет: "ELECTRICITY", elec: "ELECTRICITY",
        water: "WATER", вода: "WATER",
        heat: "HEAT", тепло: "HEAT",
      }
      if (args.length < 2) {
        await sendTelegram(chatId,
          `ℹ️ Использование: <code>/submit_meter &lt;тип&gt; &lt;показание&gt;</code>\n` +
          `Типы: electricity, water, heat\n` +
          `Пример: <code>/submit_meter water 1234.5</code>`
        )
        return NextResponse.json({ ok: true })
      }
      const typeKey = args[0].toLowerCase()
      const meterType = TYPE_MAP[typeKey]
      if (!meterType) {
        await sendTelegram(chatId, `❌ Неизвестный тип «${args[0]}». Используйте: electricity, water, heat.`)
        return NextResponse.json({ ok: true })
      }
      const value = parseFloat(args[1].replace(",", "."))
      if (!Number.isFinite(value) || value < 0) {
        await sendTelegram(chatId, `❌ Показание должно быть неотрицательным числом, получено «${args[1]}».`)
        return NextResponse.json({ ok: true })
      }

      const user = await db.user.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true },
      })
      if (!user) {
        await sendTelegram(chatId, `❌ Telegram не привязан к аккаунту. Откройте /admin/profile или /cabinet/profile, чтобы подключить.`)
        return NextResponse.json({ ok: true })
      }

      // Найти счётчик нужного типа в любом помещении этого арендатора
      const meter = await db.meter.findFirst({
        where: {
          type: meterType,
          space: {
            OR: [
              { tenant: { userId: user.id } },
              { tenantSpaces: { some: { tenant: { userId: user.id } } } },
            ],
          },
        },
        include: {
          readings: { orderBy: { createdAt: "desc" }, take: 1 },
          space: { select: { number: true } },
        },
      })

      if (!meter) {
        await sendTelegram(chatId, `❌ Счётчик типа «${typeKey}» не найден в ваших помещениях.`)
        return NextResponse.json({ ok: true })
      }

      const previous = meter.readings[0]?.value ?? 0
      if (value < previous) {
        await sendTelegram(chatId,
          `❌ Текущее показание (${value}) меньше предыдущего (${previous}). Перепроверьте значение.`
        )
        return NextResponse.json({ ok: true })
      }

      const period = new Date().toISOString().slice(0, 7)
      // Защита от дубликата за один и тот же период
      const existing = await db.meterReading.findFirst({
        where: { meterId: meter.id, period },
        orderBy: { createdAt: "desc" },
      })
      if (existing && existing.value === value) {
        await sendTelegram(chatId, `ℹ️ Показание ${value} уже сохранено за ${period}. Изменения не внесены.`)
        return NextResponse.json({ ok: true })
      }

      await db.meterReading.create({
        data: { meterId: meter.id, period, value, previous },
      })

      const consumption = Math.max(0, value - previous)
      await sendTelegram(chatId,
        `✅ Показание сохранено\n` +
        `Тип: <b>${typeKey}</b> · Помещение: ${meter.space.number}\n` +
        `Текущее: ${value} · Предыдущее: ${previous}\n` +
        `Расход за период ${period}: <b>${consumption}</b>`
      )
    } catch (e) {
      await sendTelegram(chatId, `⚠️ Ошибка сохранения показания: ${e instanceof Error ? e.message : "неизвестная"}`)
    }
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
