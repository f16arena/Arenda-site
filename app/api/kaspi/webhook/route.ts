import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { headers } from "next/headers"
import { parseKaspiWebhook, verifyKaspiWebhookSignature } from "@/lib/kaspi"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { isUniqueConstraintError } from "@/lib/prisma-errors"

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
  let referencedChargeId: string | null = null
  if (payload.reference) {
    // Reference может быть в форматах "tenant:<id>" или "charge:<id>"
    if (payload.reference.startsWith("tenant:")) {
      tenantId = payload.reference.slice("tenant:".length)
    } else if (payload.reference.startsWith("charge:")) {
      referencedChargeId = payload.reference.slice("charge:".length)
      const charge = await db.charge.findUnique({
        where: { id: referencedChargeId },
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

  // 5. Создать Payment (идемпотентно по externalRef) и погасить charges.
  //    Приоритет — конкретный charge из reference, затем FIFO по старым
  //    неоплаченным. Всё в одной транзакции (как bank-import), иначе деньги и
  //    charges рассинхронизируются (см. AUDIT_2026-05-29, пункт B).
  const resolvedTenantId = tenantId
  const result = await db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        tenantId: resolvedTenantId,
        amount: payload.amount,
        method: "KASPI",
        paymentDate: new Date(payload.paidAt),
        note: payload.purpose,
        externalRef: payload.txnId,
      },
      select: { id: true },
    })

    let chargesPaid = 0
    let remaining = payload.amount

    // a) конкретный charge из reference — закрываем первым, если сумма позволяет
    if (referencedChargeId) {
      const ref = await tx.charge.findFirst({
        where: { id: referencedChargeId, tenantId: resolvedTenantId, isPaid: false, deletedAt: null },
        select: { id: true, amount: true },
      })
      if (ref && remaining + 0.01 >= ref.amount) {
        await tx.charge.update({ where: { id: ref.id }, data: { isPaid: true } })
        chargesPaid++
        remaining = Math.round((remaining - ref.amount) * 100) / 100
      }
    }

    // b) остаток — FIFO по старым неоплаченным charge (только целиком)
    if (remaining > 0.01) {
      const unpaid = await tx.charge.findMany({
        where: { tenantId: resolvedTenantId, isPaid: false, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true },
      })
      for (const c of unpaid) {
        if (remaining + 0.01 < c.amount) break
        await tx.charge.update({ where: { id: c.id }, data: { isPaid: true } })
        chargesPaid++
        remaining = Math.round((remaining - c.amount) * 100) / 100
        if (remaining < 0.01) break
      }
    }

    // Остаток — аванс: не теряется, зачтётся в следующие начисления (аудит 2026-06-10, п.5).
    if (remaining > 0.01) {
      await tx.payment.update({ where: { id: payment.id }, data: { unappliedAmount: remaining } })
    }

    return { paymentId: payment.id, chargesPaid }
  }).catch((e) => {
    // Гонка дублей webhook'а: второй параллельный запрос с тем же txnId упёрся
    // в unique externalRef. Платёж уже создан первым — считаем дублем.
    if (isUniqueConstraintError(e)) return null
    throw e
  })

  if (!result) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  return NextResponse.json({ ok: true, matched: true, paymentId: result.paymentId, chargesPaid: result.chargesPaid })
}

// GET для проверки доступности эндпоинта (Kaspi обычно делает HEAD/GET ping)
export async function GET() {
  return NextResponse.json({ ok: true, service: "kaspi-webhook" })
}
