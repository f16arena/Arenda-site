// Простая отправка сообщений в Telegram через бот.
// Чтобы это работало:
// 1. Создать бота через @BotFather → получить TELEGRAM_BOT_TOKEN
// 2. Добавить TELEGRAM_BOT_TOKEN в Vercel env vars
// 3. Пользователь отправляет /start боту → его chat_id сохраняется в users.telegram_chat_id
//    (поток подключения: страница /admin/profile с QR/ссылкой на бота)

export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN не задан")
    return false
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error("[telegram] Ошибка отправки:", body)
      return false
    }
    return true
  } catch (e) {
    console.error("[telegram] Сетевая ошибка:", e)
    return false
  }
}
