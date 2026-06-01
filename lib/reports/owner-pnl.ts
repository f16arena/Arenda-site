// Отчёт владельца (P&L): доход / расход / налог за период + помесячная динамика.
// Доход считаем в ДВУХ базах:
//   • accrual (начисление) — из Charge по billing-периоду (type-разбивка доступна);
//   • cash (оплата) — из Payment по дате платежа (без разбивки по типам — платежи не типизированы).
// Налог: упрощёнка 3% от оборота (кассовый метод). Депозит исключаем из дохода —
// это возвратное обеспечение, не выручка. Расходы — из Expense по категориям.
//
// ВАЖНО: всё оценочно, не заменяет бухгалтера. Расходы видны только если их вносят
// (форма addExpense, finance.ts). «Крышные» арендаторы без помещения пока не
// привязаны к зданию через space — попадут в отчёт после Фазы C (привязка к зданию).

import { db } from "@/lib/db"
import { safeServerValue } from "@/lib/server-fallback"
import { CHARGE_TYPES } from "@/lib/utils"

// Дефолт: упрощёнка по новому НК РК с 2026 = 4% от оборота (маслихат ±50% → 2–6%).
// Фактическая ставка настраивается в /admin/settings и приходит параметром.
export const TAX_RATE_SIMPLIFIED = 4

/** Категории расходов (совпадают с формой addExpense). */
export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  ELECTRICITY: "Электроэнергия",
  WATER: "Водоснабжение",
  HEATING: "Отопление",
  SALARY: "Зарплата",
  REPAIR: "Ремонт",
  CLEANING: "Уборка",
  SECURITY: "Охрана",
  OTHER: "Прочее",
}

// Из дохода исключаем возвратные/служебные начисления.
const INCOME_EXCLUDED_TYPES = new Set(["DEPOSIT"])

export type PnLBreakdownItem = { key: string; label: string; amount: number }
export type PnLMonthPoint = {
  period: string // YYYY-MM
  label: string // «май 26»
  accrualIncome: number
  cashIncome: number
  expense: number
}

export type OwnerPnL = {
  range: { from: string; to: string }
  // Итоги за выбранный период
  accrualIncome: number
  cashIncome: number
  expense: number
  // Разбивки
  incomeByType: PnLBreakdownItem[] // из начислений (accrual)
  expenseByCategory: PnLBreakdownItem[]
  // Собираемость за период
  accrued: number
  collected: number
  collectionRate: number | null // collected/accrued, %
  outstandingDebt: number // непогашенные начисления (всего, не только период)
  outstandingDebtCount: number
  // Налог
  taxRatePercent: number
  // Помесячная динамика (12 мес, заканчивая месяцем `to`)
  monthly: PnLMonthPoint[]
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`
}
/** Список «YYYY-MM» месяцев, пересекающих [from, to). */
function monthsInRange(from: Date, to: Date): string[] {
  const out: string[] = []
  const cur = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  // to эксклюзивна: если to ровно на 1-е число — последний месяц не включаем
  const lastIncl = to.getDate() === 1 && to.getHours() === 0 ? new Date(end.getFullYear(), end.getMonth() - 1, 1) : end
  while (cur <= lastIncl) {
    out.push(monthKey(cur))
    cur.setMonth(cur.getMonth() + 1)
  }
  return out.length ? out : [monthKey(from)]
}
/** 12 месяцев, заканчивая месяцем, в котором лежит (to - 1мс). */
function last12Months(to: Date): string[] {
  const anchor = new Date(to.getTime() - 1)
  const out: string[] = []
  const cur = new Date(anchor.getFullYear(), anchor.getMonth() - 11, 1)
  for (let i = 0; i < 12; i++) {
    out.push(monthKey(cur))
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

export async function getOwnerPnL({
  buildingIds,
  from,
  to,
  taxRatePercent = TAX_RATE_SIMPLIFIED,
}: {
  buildingIds: string[]
  from: Date
  to: Date
  taxRatePercent?: number
}): Promise<OwnerPnL | null> {
  if (buildingIds.length === 0) return null
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/reports", extra: { buildingIds } })

  // Здания → этажи → арендаторы (как в owner-dashboard). Арендатор «в зданиях», если
  // его space/tenantSpaces/fullFloors принадлежат этим зданиям.
  const buildings = await safe(
    "ownerPnL.buildings",
    db.building.findMany({
      where: { id: { in: buildingIds }, isActive: true },
      select: { id: true, floors: { select: { id: true } } },
    }),
    [] as Array<{ id: string; floors: Array<{ id: string }> }>,
  )
  const activeBuildingIds = buildings.map((b) => b.id)
  if (activeBuildingIds.length === 0) return null
  const floorIds = buildings.flatMap((b) => b.floors.map((f) => f.id))

  const tenantInBuildings = {
    OR: [
      { space: { floorId: { in: floorIds } } },
      { tenantSpaces: { some: { space: { floorId: { in: floorIds } } } } },
      { fullFloors: { some: { buildingId: { in: activeBuildingIds } } } },
      // «Крышные» арендаторы без помещения — привязаны к зданию напрямую.
      { buildingId: { in: activeBuildingIds } },
    ],
  }

  const selMonths = monthsInRange(from, to)
  const chartMonths = last12Months(to)
  const allMonths = [...new Set([...selMonths, ...chartMonths])]
  // Окно по дате для платежей/расходов (мин. из from и начала 12-мес окна .. to)
  const chartFrom = new Date(Number(chartMonths[0].split("-")[0]), Number(chartMonths[0].split("-")[1]) - 1, 1)
  const windowFrom = chartFrom < from ? chartFrom : from

  const [chargeRows, paymentRows, expenseRows, debt] = await Promise.all([
    // Начисления по [period, type] за всё окно месяцев
    safe(
      "ownerPnL.chargesByPeriodType",
      db.charge.groupBy({
        by: ["period", "type"],
        where: { period: { in: allMonths }, tenant: tenantInBuildings },
        _sum: { amount: true },
      }),
      [] as Array<{ period: string; type: string; _sum: { amount: number | null } }>,
    ),
    // Платежи (для кассового базиса) — сырые строки, бакетируем в JS по месяцу
    safe(
      "ownerPnL.payments",
      db.payment.findMany({
        where: { paymentDate: { gte: windowFrom, lt: to }, tenant: tenantInBuildings },
        select: { amount: true, paymentDate: true },
      }),
      [] as Array<{ amount: number; paymentDate: Date }>,
    ),
    // Расходы — сырые строки с категорией
    safe(
      "ownerPnL.expenses",
      db.expense.findMany({
        where: { date: { gte: windowFrom, lt: to }, buildingId: { in: activeBuildingIds } },
        select: { amount: true, category: true, date: true },
      }),
      [] as Array<{ amount: number; category: string; date: Date }>,
    ),
    // Непогашенный долг (всего)
    safe(
      "ownerPnL.debt",
      db.charge.aggregate({
        where: { isPaid: false, tenant: tenantInBuildings },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: null as number | null }, _count: { _all: 0 } },
    ),
  ])

  const selSet = new Set(selMonths)
  const inSelDate = (d: Date) => d >= from && d < to

  // ── Доход по начислениям (accrual) за выбранный период + разбивка по типам ──
  const incomeTypeMap = new Map<string, number>()
  let accrualIncome = 0
  let accruedAll = 0 // включая депозит — для «начислено» (собираемость)
  for (const r of chargeRows) {
    const amt = r._sum.amount ?? 0
    if (!selSet.has(r.period)) continue
    accruedAll += amt
    if (INCOME_EXCLUDED_TYPES.has(r.type)) continue
    accrualIncome += amt
    incomeTypeMap.set(r.type, (incomeTypeMap.get(r.type) ?? 0) + amt)
  }
  const incomeByType: PnLBreakdownItem[] = [...incomeTypeMap.entries()]
    .map(([key, amount]) => ({ key, label: CHARGE_TYPES[key] ?? key, amount }))
    .sort((a, b) => b.amount - a.amount)

  // ── Доход по оплате (cash) за выбранный период ──
  let cashIncome = 0
  for (const p of paymentRows) if (inSelDate(p.paymentDate)) cashIncome += p.amount

  // ── Расходы за выбранный период + разбивка по категориям ──
  const expenseCatMap = new Map<string, number>()
  let expense = 0
  for (const e of expenseRows) {
    if (!inSelDate(e.date)) continue
    expense += e.amount
    expenseCatMap.set(e.category, (expenseCatMap.get(e.category) ?? 0) + e.amount)
  }
  const expenseByCategory: PnLBreakdownItem[] = [...expenseCatMap.entries()]
    .map(([key, amount]) => ({ key, label: EXPENSE_CATEGORY_LABELS[key] ?? key, amount }))
    .sort((a, b) => b.amount - a.amount)

  // ── Помесячная динамика (12 мес) ──
  const accrualByMonth = new Map<string, number>()
  for (const r of chargeRows) {
    if (INCOME_EXCLUDED_TYPES.has(r.type)) continue
    accrualByMonth.set(r.period, (accrualByMonth.get(r.period) ?? 0) + (r._sum.amount ?? 0))
  }
  const cashByMonth = new Map<string, number>()
  for (const p of paymentRows) {
    const k = monthKey(p.paymentDate)
    cashByMonth.set(k, (cashByMonth.get(k) ?? 0) + p.amount)
  }
  const expenseByMonth = new Map<string, number>()
  for (const e of expenseRows) {
    const k = monthKey(e.date)
    expenseByMonth.set(k, (expenseByMonth.get(k) ?? 0) + e.amount)
  }
  const monthly: PnLMonthPoint[] = chartMonths.map((period) => ({
    period,
    label: monthLabel(period),
    accrualIncome: Math.round(accrualByMonth.get(period) ?? 0),
    cashIncome: Math.round(cashByMonth.get(period) ?? 0),
    expense: Math.round(expenseByMonth.get(period) ?? 0),
  }))

  const collected = cashIncome
  const collectionRate = accruedAll > 0 ? Math.round((collected / accruedAll) * 100) : null

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    accrualIncome: Math.round(accrualIncome),
    cashIncome: Math.round(cashIncome),
    expense: Math.round(expense),
    incomeByType: incomeByType.map((x) => ({ ...x, amount: Math.round(x.amount) })),
    expenseByCategory: expenseByCategory.map((x) => ({ ...x, amount: Math.round(x.amount) })),
    accrued: Math.round(accruedAll),
    collected: Math.round(collected),
    collectionRate,
    outstandingDebt: Math.round(debt._sum.amount ?? 0),
    outstandingDebtCount: debt._count._all ?? 0,
    taxRatePercent,
    monthly,
  }
}
