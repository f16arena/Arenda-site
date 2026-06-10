import "server-only"
import { db } from "@/lib/db"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { applyTenantCreditToCharges } from "@/lib/tenant-credit"

export type DepositStatus = "NOT_REQUIRED" | "NOT_ISSUED" | "UNPAID" | "PARTIAL" | "PAID" | "RETURNED"

export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  NOT_REQUIRED: "Не требуется",
  NOT_ISSUED: "Не выставлен",
  UNPAID: "Не внесён",
  PARTIAL: "Частично",
  PAID: "Внесён",
  RETURNED: "Возвращён",
}

/**
 * Статус депозита арендатора по его DEPOSIT-начислениям.
 * `held` — сумма оплаченных DEPOSIT-записей (возвраты — отрицательные, вычитаются).
 */
export function computeDepositStatus(input: {
  required: number
  held: number
  hasUnpaid: boolean
  hasAnyCharge: boolean
  hasRefund: boolean
}): DepositStatus {
  const { required, held, hasUnpaid, hasAnyCharge, hasRefund } = input
  if (required <= 0 && !hasAnyCharge) return "NOT_REQUIRED"
  if (hasRefund && held <= 0.01) return "RETURNED"
  if (held >= required - 0.01 && held > 0) return "PAID"
  if (held > 0) return "PARTIAL"
  if (hasUnpaid) return "UNPAID"
  if (!hasAnyCharge) return "NOT_ISSUED"
  return "UNPAID"
}

/**
 * Сумма гарантийного депозита для договора:
 *  1) договор из конструктора — берём financials.deposit (там депозит можно
 *     отключить: enabled=false → депозита нет);
 *  2) иначе — Tenant.depositAmount; null = дефолт «1 месячная аренда».
 * Возвращает 0, если депозит не предусмотрен.
 */
function depositAmountFromBuilderState(builderState: unknown): { disabled: boolean; amount: number | null } {
  const st = builderState as { financials?: { deposit?: { enabled?: boolean; amount?: number } } } | null
  const dep = st?.financials?.deposit
  if (!dep) return { disabled: false, amount: null }
  if (dep.enabled === false) return { disabled: true, amount: null }
  const amount = typeof dep.amount === "number" && Number.isFinite(dep.amount) && dep.amount > 0 ? dep.amount : null
  return { disabled: false, amount }
}

/**
 * Создаёт начисление «Гарантийный депозит» (Charge type=DEPOSIT) после того,
 * как договор стал SIGNED. Идемпотентно: если у арендатора уже есть живое
 * DEPOSIT-начисление, ничего не делает (депозит один на арендатора и
 * переносится между версиями договора).
 *
 * Никогда не бросает — подписание уже состоялось, начисление — побочный эффект.
 */
export async function ensureDepositCharge(contractId: string): Promise<void> {
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
        startDate: true,
      },
    })
    if (!contract || contract.status !== "SIGNED") return
    // ДС не порождает второй депозит; депозит выставляется по основному договору.
    if (contract.type === "ADDENDUM") return

    const existing = await db.charge.findFirst({
      where: { tenantId: contract.tenantId, type: "DEPOSIT", deletedAt: null },
      select: { id: true },
    })
    if (existing) return

    const fromBuilder = depositAmountFromBuilderState(contract.builderState)
    if (fromBuilder.disabled) return

    let amount = fromBuilder.amount
    if (amount === null) {
      const tenant = await db.tenant.findUnique({
        where: { id: contract.tenantId },
        select: {
          depositAmount: true,
          customRate: true,
          fixedMonthlyRent: true,
          space: { select: { area: true, floor: { select: { ratePerSqm: true } } } },
          tenantSpaces: { select: { space: { select: { area: true, floor: { select: { ratePerSqm: true } } } } } },
          fullFloors: { select: { fixedMonthlyRent: true } },
        },
      })
      if (!tenant) return
      // depositAmount = 0 — депозит явно «не требуется»; null — дефолт 1 мес. аренды.
      if (tenant.depositAmount === 0) return
      amount = tenant.depositAmount ?? calculateTenantMonthlyRent(tenant)
    }
    if (!amount || amount <= 0) return

    const baseDate = contract.signedAt ?? new Date()
    const period = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}`
    await db.charge.create({
      data: {
        tenantId: contract.tenantId,
        contractId: contract.id,
        period,
        type: "DEPOSIT",
        amount: Math.round(amount * 100) / 100,
        description: `Гарантийный депозит${contract.number ? ` по договору № ${contract.number}` : ""}`,
        dueDate: contract.startDate ?? baseDate,
      },
    })
    // Если у арендатора есть аванс (переплата) — он сразу гасит депозит.
    await applyTenantCreditToCharges(contract.tenantId)
  } catch (e) {
    console.warn("[deposit charge] ошибка:", e instanceof Error ? e.message : e)
  }
}
