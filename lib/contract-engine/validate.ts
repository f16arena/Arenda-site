// Валидация состояния перед сборкой (спецификация §8).
// hard — блокируют генерацию; soft — предупреждения (источник подсказок).

import { type ContractState, UTILITY_LABELS } from "./schema"
import { type DerivedContext } from "./derive"

export interface ValidationResult {
  hard: string[]
  soft: string[]
}

export function validate(s: ContractState, c: DerivedContext): ValidationResult {
  const hard: string[] = []
  const soft: string[] = []
  const f = s.financials
  const op = f.operatingCosts

  // 8.1 ресурс in_operating_costs ⇒ метод ≠ none
  if (c.inOperating.length && op.method === "none") {
    hard.push("Есть ресурсы «в эксплуатационных расходах», но метод расчёта не выбран.")
  }
  // 8.2 fixed_per_sqm ⇒ заданы ставки
  if (op.method === "fixed_per_sqm" && (!op.fixed?.winterRate || !op.fixed?.summerRate)) {
    hard.push("Укажите тарифы эксплуатационных расходов (зима/лето).")
  }
  // 8.3 pooled_prorata ⇒ общая площадь, параметры перерасчёта
  if (op.method === "pooled_prorata") {
    if (!s.building.totalRentableAreaSqm) {
      hard.push("Для долевого расчёта укажите общую арендуемую площадь здания.")
    }
    if (op.pooled?.basis === "estimated_with_reconciliation" && !op.pooled?.estimatedRatePerSqm) {
      hard.push("Укажите авансовую ставку эксплуатационных расходов.")
    }
  }
  // 8.4 scope=all_inclusive ⇒ нет двойного начисления: при «всё включено»
  // эксплуатационные расходы уже покрывают коммуналку Помещения, поэтому любой
  // ресурс по индивидуальному счётчику = двойное начисление (исправл. 3.2).
  if (op.method !== "none" && op.scope === "all_inclusive" && c.metered.length) {
    hard.push(
      "Двойное начисление: " +
        c.metered.map((r) => UTILITY_LABELS[r.key]).join(", ") +
        " оплачиваются по счётчику, хотя эксплуатационные расходы (scope «всё включено») уже покрывают коммунальные услуги Помещения. Переведите эти ресурсы в «эксплуатационные расходы» или смените scope на «только МОП».",
    )
  }
  // 8.7 даты, день оплаты, депозит
  if (s.term.startDate && s.term.endDate && new Date(s.term.startDate) >= new Date(s.term.endDate)) {
    hard.push("Дата начала аренды должна быть раньше даты окончания.")
  }
  if (f.paymentDueDay < 1 || f.paymentDueDay > 28) {
    hard.push("День оплаты должен быть в диапазоне 1–28.")
  }

  // soft
  if (!f.monthlyRent) soft.push("Не указана арендная плата.")
  if (f.deposit.enabled !== false && !f.deposit.amount) soft.push("Не указан размер гарантийного депозита (обычно = 1 месячной плате).")
  if (
    f.penalty.tenantPerDay !== f.penalty.landlordPerDay ||
    f.penalty.tenantCapPercent !== f.penalty.landlordCapPercent
  ) {
    soft.push("Пеня сторон различается — рекомендуется симметрия.")
  }

  return { hard, soft }
}
