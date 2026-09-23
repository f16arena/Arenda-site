import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendTelegram } from "@/lib/telegram"
import { getT, getTForUser } from "@/lib/i18n/server"
import { formatMoneyL } from "@/lib/i18n/format"

export const dynamic = "force-dynamic"

// Webhook от Telegram. URL: https://commrent.kz/api/telegram/webhook
// Регистрируется через /api/telegram/setup
//
// Язык ответа — язык того, кто пишет боту: чат привязан к пользователю, берём
// locale из его профиля. Пока чат не привязан (первое /start), языка ещё нет —
// отвечаем на языке по умолчанию, cookie у webhook-запроса не бывает.

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

/**
 * Название роли: сначала общий справочник domain.roles, затем те роли, которых
 * в нём нет (adminDocs.api.roles). Если и там нет — отдаём код как есть, чтобы
 * человек хотя бы увидел, что это за роль.
 */
function roleLabel(t: Awaited<ReturnType<typeof getT>>["t"], role: string): string {
  const domainKey = `domain.roles.${role}` as Parameters<typeof t>[0]
  const fromDomain = t(domainKey)
  if (fromDomain !== domainKey) return fromDomain
  const extraKey = `adminDocs.api.roles.${role}` as Parameters<typeof t>[0]
  const fromExtra = t(extraKey)
  return fromExtra === extraKey ? role : fromExtra
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

  // Чат уже привязан? Тогда язык берём из профиля этого пользователя.
  const linked = await db.user.findFirst({
    where: { telegramChatId: chatId },
    select: { id: true, name: true, role: true },
  }).catch(() => null)
  const { t, locale } = linked ? await getTForUser(linked.id) : await getT()

  const userName = msg.from?.first_name ?? msg.chat.first_name ?? t("emails.telegram.unknownUser")
  const errorText = (e: unknown) => (e instanceof Error ? e.message : t("emails.telegram.unknownError"))

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
          await sendTelegram(chatId, t("emails.telegram.linkInvalid"))
          return NextResponse.json({ ok: true })
        }
        if (tok.usedAt) {
          await sendTelegram(chatId, t("emails.telegram.linkUsed"))
          return NextResponse.json({ ok: true })
        }
        if (tok.expiresAt < new Date()) {
          await sendTelegram(chatId, t("emails.telegram.linkExpired"))
          return NextResponse.json({ ok: true })
        }
        if (!tok.userId) {
          await sendTelegram(chatId, t("emails.telegram.linkNoUser"))
          return NextResponse.json({ ok: true })
        }

        // Привязываем — и дальше говорим уже на языке владельца аккаунта.
        const { t: tOwner } = await getTForUser(tok.userId)
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

        await sendTelegram(chatId, tOwner("emails.telegram.connected", { name: user?.name ?? "—" }))
      } catch (e) {
        await sendTelegram(chatId, t("emails.telegram.linkError", { error: errorText(e) }))
      }
      return NextResponse.json({ ok: true })
    }

    await sendTelegram(chatId, t("emails.telegram.welcome", { name: userName, chatId }))
    return NextResponse.json({ ok: true })
  }

  // /help
  if (text.startsWith("/help")) {
    await sendTelegram(chatId, t("emails.telegram.help"))
    return NextResponse.json({ ok: true })
  }

  // /balance — текущая задолженность для арендатора, привязанного к этому Telegram
  if (text.startsWith("/balance")) {
    try {
      if (!linked) {
        await sendTelegram(chatId, t("emails.telegram.notLinked"))
        return NextResponse.json({ ok: true })
      }
      const tenant = await db.tenant.findUnique({
        where: { userId: linked.id },
        select: {
          id: true,
          companyName: true,
          charges: {
            where: { deletedAt: null, isPaid: false },
            select: { id: true, type: true, amount: true, period: true, dueDate: true },
            orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
            take: 10,
          },
        },
      })
      if (!tenant) {
        await sendTelegram(chatId, t("emails.telegram.notTenant"))
        return NextResponse.json({ ok: true })
      }
      if (tenant.charges.length === 0) {
        await sendTelegram(chatId, t("emails.telegram.noDebt", { company: tenant.companyName }))
        return NextResponse.json({ ok: true })
      }
      const total = tenant.charges.reduce((sum, charge) => sum + charge.amount, 0)
      const lines = tenant.charges.slice(0, 5).map((charge) => {
        const typeKey = `domain.chargeTypes.${charge.type}` as Parameters<typeof t>[0]
        const typeLabel = t(typeKey)
        return t("emails.telegram.balanceLine", {
          period: charge.period,
          type: typeLabel === typeKey ? charge.type : typeLabel,
          amount: formatMoneyL(locale, Math.round(charge.amount)),
        })
      }).join("\n")
      const more = tenant.charges.length > 5
        ? t("emails.telegram.balanceMore", { count: tenant.charges.length - 5 })
        : ""
      await sendTelegram(chatId, t("emails.telegram.balance", {
        total: formatMoneyL(locale, Math.round(total)),
        company: tenant.companyName,
        lines,
        more,
      }))
    } catch (e) {
      await sendTelegram(chatId, t("emails.telegram.balanceError", { error: errorText(e) }))
    }
    return NextResponse.json({ ok: true })
  }

  // /submit_meter <тип> <показание>
  if (text.startsWith("/submit_meter")) {
    try {
      const args = text.slice("/submit_meter".length).trim().split(/\s+/).filter(Boolean)
      // Ключи команды латиницей и по-русски оставлены как есть: их набирает
      // человек в чате, и старые подсказки должны продолжать работать.
      const TYPE_MAP: Record<string, string> = {
        electricity: "ELECTRICITY", свет: "ELECTRICITY", elec: "ELECTRICITY", жарық: "ELECTRICITY",
        water: "WATER", вода: "WATER", су: "WATER",
        heat: "HEAT", тепло: "HEAT", жылу: "HEAT",
      }
      if (args.length < 2) {
        await sendTelegram(chatId, t("emails.telegram.meterUsage"))
        return NextResponse.json({ ok: true })
      }
      const typeKey = args[0].toLowerCase()
      const meterType = TYPE_MAP[typeKey]
      if (!meterType) {
        await sendTelegram(chatId, t("emails.telegram.meterUnknownType", { type: args[0] }))
        return NextResponse.json({ ok: true })
      }
      const value = parseFloat(args[1].replace(",", "."))
      if (!Number.isFinite(value) || value < 0) {
        await sendTelegram(chatId, t("emails.telegram.meterBadValue", { value: args[1] }))
        return NextResponse.json({ ok: true })
      }

      if (!linked) {
        await sendTelegram(chatId, t("emails.telegram.notLinked"))
        return NextResponse.json({ ok: true })
      }

      // Найти счётчик нужного типа в любом помещении этого арендатора
      const meter = await db.meter.findFirst({
        where: {
          type: meterType,
          space: {
            OR: [
              { tenant: { userId: linked.id } },
              { tenantSpaces: { some: { tenant: { userId: linked.id } } } },
            ],
          },
        },
        include: {
          readings: { orderBy: { createdAt: "desc" }, take: 1 },
          space: { select: { number: true } },
        },
      })

      if (!meter) {
        await sendTelegram(chatId, t("emails.telegram.meterNotFound", { type: typeKey }))
        return NextResponse.json({ ok: true })
      }

      const previous = meter.readings[0]?.value ?? 0
      if (value < previous) {
        await sendTelegram(chatId, t("emails.telegram.meterLessThanPrevious", { value, previous }))
        return NextResponse.json({ ok: true })
      }

      const period = new Date().toISOString().slice(0, 7)
      // Защита от дубликата за один и тот же период
      const existing = await db.meterReading.findFirst({
        where: { meterId: meter.id, period },
        orderBy: { createdAt: "desc" },
      })
      if (existing && existing.value === value) {
        await sendTelegram(chatId, t("emails.telegram.meterDuplicate", { value, period }))
        return NextResponse.json({ ok: true })
      }

      await db.meterReading.create({
        data: { meterId: meter.id, period, value, previous },
      })

      const consumption = Math.max(0, value - previous)
      await sendTelegram(chatId, t("emails.telegram.meterSaved", {
        type: typeKey,
        space: meter.space.number,
        value,
        previous,
        period,
        consumption,
      }))
    } catch (e) {
      await sendTelegram(chatId, t("emails.telegram.meterError", { error: errorText(e) }))
    }
    return NextResponse.json({ ok: true })
  }

  // /myid
  if (text.startsWith("/myid")) {
    await sendTelegram(chatId, t("emails.telegram.myId", { chatId }))
    return NextResponse.json({ ok: true })
  }

  // /status — проверка подключения
  if (text.startsWith("/status")) {
    try {
      if (!linked) {
        await sendTelegram(chatId, t("emails.telegram.statusNotLinked", { chatId }))
      } else {
        const unread = await db.notification.count({
          where: { userId: linked.id, isRead: false },
        })
        await sendTelegram(chatId, t("emails.telegram.statusLinked", {
          name: linked.name,
          role: roleLabel(t, linked.role),
          unread,
        }))
      }
    } catch (e) {
      await sendTelegram(chatId, t("emails.telegram.linkError", { error: errorText(e) }))
    }
    return NextResponse.json({ ok: true })
  }

  // Любое другое сообщение — подсказка
  await sendTelegram(chatId, t("emails.telegram.fallback"))

  return NextResponse.json({ ok: true })
}
