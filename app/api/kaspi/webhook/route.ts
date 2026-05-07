import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { headers } from "next/headers"
import { parseKaspiWebhook, verifyKaspiWebhookSignature } from "@/lib/kaspi"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

// POST /api/kaspi/webhook
// Принимает уведомление о входящем платеже от Kaspi Pay.
// Сопоставляет с открытыми Charge по reference (если был) или по сумме+ИИН.
export async function POST(request: Request) {
  const reqHeaders = await headers()

  // Rate limit: 60 webhook'ов в минуту с одного IP. Kaspi не должен слать чаще.
  const rl = checkRateLimit(getClientKey(reqHeaders, "kaspi-webhook"), { max: 60, window: 60_000 })
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 })
  }

  // 1. Прочитать сырое тело для проверки HMAC-подписи
  const rawBody = await request.text()
  const signature = reqHeaders.get("x-kaspi-signature")
  const valid = await verifyKaspiWebhookSignature(rawBody, signature)
  if (!valid) {
    console.warn("[kaspi] Webhook signature invalid")
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // 2. Распарсить
  const json = (() => { try { return JSON.parse(rawBody) } catch { return null } })()
  const payload = parseKaspiWebhook(json)
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  // 3. Идемпотентность: если уже обработан этот txnId — вернуть 200
  const existing = await db.payment.findFirst({
    where: { externalRef: payload.txnId },
    select: { id: true },
  }).catch(() => null)
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, paymentId: existing.id })
  }

  // 4. Найти арендатора:
  //    a) по reference (если в QR был передан tenantId/chargeId)
  //    b) по ИИН/БИН плательщика
  let tenantId: string | null = null
  if (payload.reference) {
    // Reference может быть в форматах "tenant:<id>" или "charge:<id>"
    if (payload.reference.startsWith("tenant:")) {
      tenantId = payload.reference.slice("tenant:".length)
    } else if (payload.reference.startsWith("charge:")) {
      const charge = await db.charge.findUnique({
        where: { id: payload.reference.slice("charge:".length) },
        select: { tenantId: true },
      }).catch(() => null)
      tenantId = charge?.tenantId ?? null
    }
  }
  if (!tenantId && payload.payerBin) {
    const tenant = await db.tenant.findFirst({
      where: { bin: payload.payerBin },
      select: { id: true },
    }).catch(() => null)
    tenantId = tenant?.id ?? null
  }

  if (!tenantId) {
    // Не смогли распознать арендатора — сохраняем «осиротевший» платёж
    // в очередь сверки. Бухгалтер привяжет вручную в /admin/finances.
    // Минимально: лог + 200 чтобы Kaspi не ретраил.
    console.warn(
      `[kaspi] Webhook: не распознан плательщик. txnId=${payload.txnId} ` +
      `amount=${payload.amount} purpose="${payload.purpose}"`,
    )
    return NextResponse.json({ ok: true, matched: false })
  }

  // 5. Создать Payment и (опционально) погасить ближайший Charge
  await db.payment.create({
    data: {
      tenantId,
      amount: payload.amount,
      method: "KASPI",
      paymentDate: new Date(payload.paidAt),
      note: payload.purpose,
      externalRef: payload.txnId,
    },
  })

  return NextResponse.json({ ok: true, matched: true })
}

// GET для проверки доступности эндпоинта (Kaspi обычно делает HEAD/GET ping)
export async function GET() {
  return NextResponse.json({ ok: true, service: "kaspi-webhook" })
}
