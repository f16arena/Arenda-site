import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Одноразовая регистрация webhook у Telegram.
// Вызвать ОДИН РАЗ после деплоя:
//   GET /api/telegram/setup?secret=<CRON_SECRET>
//
// После успеха Telegram будет слать обновления на /api/telegram/webhook
//
// Чтобы УБРАТЬ webhook (например при отладке локально):
//   GET /api/telegram/setup?secret=<CRON_SECRET>&action=delete

export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get("secret")
  const action = url.searchParams.get("action") ?? "set"

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden — wrong secret" }, { status: 403 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN не задан в env" }, { status: 500 })
  }

  if (action === "delete") {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`)
    const body = await res.json()
    return NextResponse.json({ action: "delete", body })
  }

  if (action === "info") {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const body = await res.json()
    return NextResponse.json({ action: "info", body })
  }

  // По умолчанию — устанавливаем webhook
  const host = req.headers.get("host") ?? new URL(req.url).host
  const webhookUrl = `https://${host}/api/telegram/webhook`
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? ""

  const params = new URLSearchParams({
    url: webhookUrl,
    allowed_updates: JSON.stringify(["message"]),
    drop_pending_updates: "true",
  })
  if (webhookSecret) params.set("secret_token", webhookSecret)

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?${params}`)
  const body = await res.json()

  return NextResponse.json({
    action: "set",
    webhookUrl,
    hasSecret: !!webhookSecret,
    body,
  })
}
