import type { TxClient } from "@/lib/db"

// Кассовые проводки платежа: создание/откат/возврат баланса.
//
// Вынесено из app/actions/finance.ts, чтобы (а) переиспользовать в record/
// delete/bulkDelete/restore, (б) сделать paymentId ОБЯЗАТЕЛЬНЫМ при создании
// проводки — раньше recordPayment его не ставил, и deletePayment не находил
// проводку, из-за чего CashAccount.balance не откатывался
// (см. AUDIT_2026-05-29, проблема #5).
//
// Все функции принимают транзакционный клиент (tx) — вызывать внутри
// db.$transaction, чтобы платёж и баланс кассы менялись атомарно.

/**
 * Создаёт кассовую проводку (DEPOSIT) для платежа и увеличивает баланс счёта.
 * paymentId ОБЯЗАТЕЛЕН — это связь, по которой reversePaymentCash находит
 * проводку при удалении платежа.
 */
export async function recordPaymentCash(
  tx: TxClient,
  args: { paymentId: string; cashAccountId: string; amount: number; description: string },
): Promise<void> {
  await tx.cashTransaction.create({
    data: {
      accountId: args.cashAccountId,
      amount: args.amount,
      type: "DEPOSIT",
      description: args.description,
      paymentId: args.paymentId,
    },
  })
  await tx.cashAccount.update({
    where: { id: args.cashAccountId },
    data: { balance: { increment: args.amount } },
  })
}

/**
 * Откатывает баланс кассы по всем проводкам платежа(ей) — при удалении.
 * Проводки НЕ удаляет: оставляет привязанными к soft-deleted платежу, чтобы
 * reapplyPaymentCash мог вернуть баланс при restore (undo). Проводки нигде в UI
 * не листаются, поэтому «висящая» запись безвредна. Возвращает число проводок.
 */
export async function reversePaymentCash(tx: TxClient, paymentIds: string | string[]): Promise<number> {
  const ids = Array.isArray(paymentIds) ? paymentIds : [paymentIds]
  if (ids.length === 0) return 0
  const cashTxs = await tx.cashTransaction.findMany({
    where: { paymentId: { in: ids } },
    select: { amount: true, accountId: true },
  })
  for (const ct of cashTxs) {
    await tx.cashAccount.update({
      where: { id: ct.accountId },
      data: { balance: { decrement: ct.amount } },
    })
  }
  return cashTxs.length
}

/**
 * Возвращает баланс кассы по проводкам платежа(ей) — при restore (undo).
 * Обратна reversePaymentCash. Возвращает число проводок.
 */
export async function reapplyPaymentCash(tx: TxClient, paymentIds: string | string[]): Promise<number> {
  const ids = Array.isArray(paymentIds) ? paymentIds : [paymentIds]
  if (ids.length === 0) return 0
  const cashTxs = await tx.cashTransaction.findMany({
    where: { paymentId: { in: ids } },
    select: { amount: true, accountId: true },
  })
  for (const ct of cashTxs) {
    await tx.cashAccount.update({
      where: { id: ct.accountId },
      data: { balance: { increment: ct.amount } },
    })
  }
  return cashTxs.length
}
