import { money } from "@/lib/money"
import "server-only"
import { db } from "@/lib/db"

/**
 * Аванс (переплата) арендатора: сумма нераспределённых остатков платежей.
 * Остаток возникает, когда платёж больше начислений (FIFO гасит только целиком).
 */
export async function getTenantCredit(tenantId: string): Promise<number> {
  const agg = await db.payment.aggregate({
    where: { tenantId, deletedAt: null, unappliedAmount: { gt: 0 } },
    _sum: { unappliedAmount: true },
  })
  return money(agg._sum.unappliedAmount ?? 0)
}

/**
 * Зачитывает накопленный аванс в неоплаченные начисления (FIFO, только целиком).
 * Вызывается после создания новых начислений (cron, ручное начисление, депозит),
 * чтобы переплата автоматически закрывала их без участия админа.
 * Возвращает число закрытых начислений. Никогда не бросает.
 */
export async function applyTenantCreditToCharges(tenantId: string): Promise<number> {
  try {
    return await db.$transaction(async (tx) => {
      const credits = await tx.payment.findMany({
        where: { tenantId, deletedAt: null, unappliedAmount: { gt: 0 } },
        orderBy: { paymentDate: "asc" },
        select: { id: true, unappliedAmount: true },
      })
      let pool = money(credits.reduce((s, p) => s + p.unappliedAmount, 0))
      if (pool <= 0.01) return 0

      const unpaid = await tx.charge.findMany({
        where: { tenantId, isPaid: false, deletedAt: null },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: { id: true, amount: true },
      })

      let covered = 0
      let consumed = 0
      for (const c of unpaid) {
        if (pool + 0.01 < c.amount) break
        await tx.charge.update({ where: { id: c.id }, data: { isPaid: true } })
        pool = money(pool - c.amount)
        consumed = money(consumed + c.amount)
        covered++
      }
      if (covered === 0) return 0

      // Списываем потраченный аванс со старейших платежей.
      let toConsume = consumed
      for (const p of credits) {
        if (toConsume <= 0.01) break
        const take = Math.min(p.unappliedAmount, toConsume)
        await tx.payment.update({
          where: { id: p.id },
          data: { unappliedAmount: money(p.unappliedAmount - take) },
        })
        toConsume = money(toConsume - take)
      }
      return covered
    })
  } catch (e) {
    console.warn("[tenant-credit] зачёт аванса не удался:", e instanceof Error ? e.message : e)
    return 0
  }
}
