// Kaspi Pay интеграция — заготовка.
//
// Чтобы включить:
// 1. Получить TradePoint ID и API-ключ через Kaspi Business
//    (https://kaspi.kz/business/, раздел «API для приёма платежей»)
// 2. Установить env:
//    KASPI_TRADE_POINT_ID="..."
//    KASPI_API_KEY="..."
//    KASPI_WEBHOOK_SECRET="..."
//    KASPI_API_BASE_URL="https://kaspi.kz/api/v01" (production) или sandbox URL
// 3. В Kaspi Business → Webhooks: указать URL `https://<your-domain>/api/kaspi/webhook`
//
// Документация Kaspi Pay API: https://kaspi.kz/help/business/api-for-payments

const ENABLED =
  Boolean(process.env.KASPI_TRADE_POINT_ID) && Boolean(process.env.KASPI_API_KEY)

export function isKaspiEnabled(): boolean {
  return ENABLED
}

/** Тип платежа от Kaspi Pay */
export interface KaspiWebhookPayload {
  /** ID транзакции в Kaspi */
  txnId: string
  /** Сумма в тенге */
  amount: number
  /** ISO timestamp оплаты */
  paidAt: string
  /** Назначение платежа (как введено плательщиком) */
  purpose: string
  /** ИИН/БИН плательщика (если доступен) */
  payerBin?: string
  /** Имя плательщика */
  payerName?: string
  /** Наш референс (например chargeId), переданный при генерации QR */
  reference?: string
}

/**
 * Генерирует строку для QR-кода Kaspi Pay.
 *
 * Без подключённого API возвращает простую строку с реквизитами для
 * обычного перевода — мобильный Kaspi её распознает как платёж по реквизитам.
 *
 * С подключённым API можно получать QR через TradePoint и они будут
 * автоматически матчиться по reference.
 */
export async function buildKaspiPayQrString(input: {
  amount: number
  description: string
  reference?: string
}): Promise<string> {
  if (!ENABLED) {
    // Fallback: простая строка для перевода. Kaspi-клиент откроет ввод
    // вручную, и сумма попадёт в нашу банковскую выписку,
    // где её подтянет bank-import.
    return `KASPI:${input.amount.toFixed(0)}:${input.description}`
  }

  // TODO(kaspi): реализовать вызов Kaspi Pay API после получения ключей.
  //   POST {KASPI_API_BASE_URL}/qr/create
  //   Authorization: Bearer {KASPI_API_KEY}
  //   { tradePointId, amount, purpose, externalRef }
  //   → { qrPaymentLink: "https://..." }
  throw new Error("Kaspi Pay API integration not yet implemented")
}

/**
 * Проверяет подпись webhook'а от Kaspi.
 * Подпись приходит в header X-Kaspi-Signature, считается HMAC-SHA256
 * от тела запроса с использованием KASPI_WEBHOOK_SECRET.
 */
export async function verifyKaspiWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = process.env.KASPI_WEBHOOK_SECRET
  if (!secret) {
    console.warn("[kaspi] KASPI_WEBHOOK_SECRET не настроен — webhook не проверяется")
    return false
  }
  if (!signatureHeader) return false

  const { createHmac, timingSafeEqual } = await import("crypto")
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signatureHeader.trim())
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Парсит сырой webhook от Kaspi в типизированный объект.
 * Реальный формат уточнить в документации Kaspi для конкретного типа интеграции.
 */
export function parseKaspiWebhook(raw: unknown): KaspiWebhookPayload | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  const txnId = typeof r.txnId === "string" ? r.txnId
    : typeof r.transactionId === "string" ? r.transactionId
    : null
  const amount = typeof r.amount === "number" ? r.amount
    : typeof r.amount === "string" ? Number(r.amount)
    : null
  const paidAt = typeof r.paidAt === "string" ? r.paidAt
    : typeof r.timestamp === "string" ? r.timestamp
    : null
  const purpose = typeof r.purpose === "string" ? r.purpose
    : typeof r.comment === "string" ? r.comment
    : ""

  if (!txnId || amount === null || !Number.isFinite(amount) || amount <= 0 || !paidAt) {
    return null
  }

  return {
    txnId,
    amount,
    paidAt,
    purpose,
    payerBin: typeof r.payerBin === "string" ? r.payerBin : undefined,
    payerName: typeof r.payerName === "string" ? r.payerName : undefined,
    reference: typeof r.reference === "string" ? r.reference
      : typeof r.externalRef === "string" ? r.externalRef
      : undefined,
  }
}
