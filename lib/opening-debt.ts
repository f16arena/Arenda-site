import "server-only"
import { db } from "@/lib/db"
import { debtRemainder, type DebtSettlement } from "@/lib/contract-engine/schema"

// Маркер в description — по нему проверяется идемпотентность (второй вызов после
// повторного applySignedContractChanges не должен создать дубль начисления).
const OPENING_DEBT_PREFIX = "Входящий долг"

function debtFromBuilderState(builderState: unknown): DebtSettlement | null {
  const st = builderState as { financials?: { debtSettlement?: DebtSettlement } } | null
  const d = st?.financials?.debtSettlement
  if (!d || d.enabled !== true) return null
  if (typeof d.totalAmount !== "number" || !Number.isFinite(d.totalAmount) || d.totalAmount <= 0) return null
  return d
}

/**
 * Создаёт начисление-остаток входящего долга (раздел «Урегулирование ранее
 * образовавшейся задолженности» конструктора) после того, как договор стал
 * SIGNED. Тип OTHER («Прочее»): считается в долге арендатора, но не конфликтует
 * с уникальностью (tenant, period, RENT) и не перебивается авто-биллингом —
 * та же схема, что у входящего долга внешнего договора (external-contract.ts).
 *
 * Идемпотентно (по маркеру в description + contractId). Никогда не бросает —
 * подписание уже состоялось, начисление — побочный эффект.
 */
export async function ensureOpeningDebtCharge(contractId: string): Promise<void> {
  try {
    const contract = await db.contract.findFirst({
      where: { id: contractId, deletedAt: null },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        tenantId: true,
        builderState: true,
        signedAt: true,
      },
    })
    if (!contract || contract.status !== "SIGNED") return
    // ДС не порождает второго начисления — долг фиксируется основным договором.
    if (contract.type === "ADDENDUM") return

    const debt = debtFromBuilderState(contract.builderState)
    if (!debt) return

    const existing = await db.charge.findFirst({
      where: {
        contractId: contract.id,
        type: "OTHER",
        deletedAt: null,
        description: { startsWith: OPENING_DEBT_PREFIX },
      },
      select: { id: true },
    })
    if (existing) return

    const signedAt = contract.signedAt ?? new Date()
    const months = Number.isInteger(debt.payWithinMonths) && debt.payWithinMonths >= 1 ? debt.payWithinMonths : 2
    const dueDate = new Date(signedAt)
    dueDate.setMonth(dueDate.getMonth() + months)

    const remainder = debtRemainder(debt)
    const details = [
      debt.basisDoc?.trim() ? debt.basisDoc.trim() : null,
      debt.discountPercent > 0 ? `с учётом уменьшения ${debt.discountPercent}% по договору № ${contract.number}` : `по договору № ${contract.number}`,
    ].filter(Boolean).join("; ")

    await db.charge.create({
      data: {
        tenantId: contract.tenantId,
        contractId: contract.id,
        period: signedAt.toISOString().slice(0, 7),
        type: "OTHER",
        amount: remainder,
        description: `${OPENING_DEBT_PREFIX}: ${details}`,
        dueDate,
      },
    })
  } catch (e) {
    console.error("[opening-debt] не удалось создать начисление входящего долга:", e)
  }
}
