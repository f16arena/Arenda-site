import { config } from "dotenv"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

import { PrismaClient } from "../app/generated/prisma/client"

config({ path: ".env.local" })
config({ path: ".env" })

// Backfill CashTransaction.paymentId для исторических DEPOSIT-проводок, созданных
// до фикса recordPayment (см. AUDIT_2026-05-29, проблема #5 / пункт F).
//
// Зачем: старые проводки имеют payment_id = NULL, поэтому deletePayment/
// bulkDeletePayments не находят их и не откатывают CashAccount.balance.
// Скрипт привязывает проводку к платежу ТОЛЬКО при однозначном совпадении:
//   - та же сумма;
//   - тот же организационный контекст (account.org == payment.tenant.user.org);
//   - createdAt в окне ±5с (проводка и платёж создавались в одной транзакции
//     recordPayment, поэтому их createdAt отличаются на миллисекунды);
//   - ровно ОДИН платёж-кандидат без уже привязанной проводки.
// Неоднозначные/без совпадения — пропускаются и выводятся для ручного разбора.
//
// ВАЖНО: backfill ставит связь на будущее (чтобы удаление этих платежей теперь
// корректно откатывало баланс). Историческую рассинхронизацию баланса (если
// старые платежи уже удаляли) он НЕ исправляет — это отдельная сверка кассы.
//
// По умолчанию DRY-RUN (ничего не пишет). Применение: --apply + BACKFILL_ALLOW_WRITE=1.
// БД: E2E_DATABASE_URL (приоритет) или DATABASE_URL.

const APPLY = process.argv.includes("--apply")
const WINDOW_MS = 5_000

async function main() {
  const url = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL (или E2E_DATABASE_URL) обязателен")
  if (APPLY && process.env.BACKFILL_ALLOW_WRITE !== "1") {
    throw new Error("--apply требует BACKFILL_ALLOW_WRITE=1 (защита от случайной записи)")
  }

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 30_000,
    statement_timeout: 30_000,
  })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  try {
    // Платежи, к которым уже привязана хотя бы одна проводка — исключаем из кандидатов.
    const linkedPaymentIds = new Set(
      (await db.cashTransaction.findMany({
        where: { paymentId: { not: null } },
        select: { paymentId: true },
      }))
        .map((r) => r.paymentId)
        .filter((id): id is string => !!id),
    )

    const orphans = await db.cashTransaction.findMany({
      where: { paymentId: null, type: "DEPOSIT" },
      select: { id: true, amount: true, createdAt: true, account: { select: { organizationId: true } } },
    })
    console.log(`[backfill] DEPOSIT-проводок без payment_id: ${orphans.length}`)

    let linked = 0
    let ambiguous = 0
    let unmatched = 0

    for (const ct of orphans) {
      const lo = new Date(ct.createdAt.getTime() - WINDOW_MS)
      const hi = new Date(ct.createdAt.getTime() + WINDOW_MS)

      const candidates = (await db.payment.findMany({
        where: { amount: ct.amount, deletedAt: null, createdAt: { gte: lo, lte: hi } },
        select: { id: true, tenant: { select: { user: { select: { organizationId: true } } } } },
      })).filter(
        (p) =>
          !linkedPaymentIds.has(p.id) &&
          p.tenant?.user?.organizationId === ct.account.organizationId,
      )

      if (candidates.length === 1) {
        const paymentId = candidates[0].id
        if (APPLY) {
          await db.cashTransaction.update({ where: { id: ct.id }, data: { paymentId } })
        }
        linkedPaymentIds.add(paymentId) // не привязать тот же платёж к двум проводкам
        linked++
      } else if (candidates.length > 1) {
        ambiguous++
        console.log(
          `[backfill] AMBIGUOUS: cashTx ${ct.id} (amount=${ct.amount}) → ${candidates.length} кандидатов, пропуск`,
        )
      } else {
        unmatched++
      }
    }

    console.log(
      `[backfill] ${APPLY ? "APPLIED" : "DRY-RUN"}: linked=${linked}, ambiguous=${ambiguous}, unmatched=${unmatched}`,
    )
    if (!APPLY) {
      console.log("[backfill] DRY-RUN — ничего не изменено. Для записи: --apply и BACKFILL_ALLOW_WRITE=1.")
    }
  } finally {
    await db.$disconnect()
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[backfill] failed")
  console.error(error)
  process.exit(1)
})
