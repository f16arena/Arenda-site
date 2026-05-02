// SMS-уведомления через Mobizon (Казахстан).
//
// Регистрация: https://mobizon.kz — принимают физлиц, не требуют ТОО для базы.
// API-ключ: профиль → API-ключи → создать.
// Установить переменную окружения MOBIZON_API_KEY (и опционально MOBIZON_SENDER_ID
// — буквенное имя отправителя, должно быть зарегистрировано в Mobizon).
//
// Формат номера: международный без + (например 77001234567).

const MOBIZON_API = "https://api.mobizon.kz/service/Message/SendSMSMessage"

export type SmsResult =
  | { ok: true; messageId: string; cost?: number }
  | { ok: false; error: string }

/**
 * Нормализовать казахстанский номер в формат E.164 без +.
 * "+7 (700) 123-45-67" → "77001234567"
 * "8 700 123 45 67" → "77001234567"
 * "7001234567" → "77001234567"
 */
export function normalizeKzPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "")
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return "7" + digits.slice(1)
  }
  if (digits.length === 10 && digits.startsWith("7")) {
    return "7" + digits  // 7001234567 → 77001234567
  }
  if (digits.length === 11 && digits.startsWith("77")) {
    return digits  // уже правильный
  }
  return null
}

/**
 * Отправить одно SMS. Если ключ не настроен — пишем в лог и возвращаем
 * graceful ошибку (не падаем).
 */
export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const apiKey = process.env.MOBIZON_API_KEY
  if (!apiKey) {
    console.warn(`[sms] MOBIZON_API_KEY не настроен. Не отправлено: ${to} → "${text.slice(0, 50)}..."`)
    return { ok: false, error: "SMS не настроен (нет MOBIZON_API_KEY)" }
  }

  const phone = normalizeKzPhone(to)
  if (!phone) {
    return { ok: false, error: `Неверный номер: ${to}` }
  }

  // Mobizon ограничивает текст 160 символов латиницей или 70 кириллицей.
  // Делим длинные сообщения на сегменты — Mobizon склеит на стороне получателя.
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 600)

  const body = new URLSearchParams({
    apiKey,
    recipient: phone,
    text: cleaned,
  })
  if (process.env.MOBIZON_SENDER_ID) {
    body.set("from", process.env.MOBIZON_SENDER_ID)
  }

  try {
    const res = await fetch(MOBIZON_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    const data = (await res.json()) as {
      code: number
      message?: string
      data?: { messageId?: string; cost?: number; campaignId?: string }
    }
    if (data.code !== 0) {
      return { ok: false, error: data.message ?? `Mobizon code=${data.code}` }
    }
    return {
      ok: true,
      messageId: String(data.data?.messageId ?? ""),
      cost: data.data?.cost,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" }
  }
}

/**
 * Скоринг длины SMS — для UI чтобы показать сколько сегментов уйдёт.
 * Кириллица: 70 (один сегмент), 67 на каждый следующий (UDH-склейка)
 * Латиница: 160 / 153
 */
export function smsSegments(text: string): { segments: number; charsUsed: number; encoding: "GSM" | "UCS-2" } {
  const isCyrillic = /[А-яЁё]/.test(text)
  const limit = isCyrillic ? 70 : 160
  const concat = isCyrillic ? 67 : 153
  const len = text.length
  if (len === 0) return { segments: 0, charsUsed: 0, encoding: isCyrillic ? "UCS-2" : "GSM" }
  if (len <= limit) return { segments: 1, charsUsed: len, encoding: isCyrillic ? "UCS-2" : "GSM" }
  return {
    segments: Math.ceil(len / concat),
    charsUsed: len,
    encoding: isCyrillic ? "UCS-2" : "GSM",
  }
}
