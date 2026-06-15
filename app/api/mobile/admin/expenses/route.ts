import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobilePaymentStaffRequest } from "@/lib/mobile-admin"
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "@/lib/utils"
import { parsePositiveAmount } from "@/lib/mobile-tenant"

export const dynamic = "force-dynamic"

const WINTER_MONTHS = [10, 11, 12, 1, 2, 3, 4]

function prevPeriodOf(period: string) {
  const [y, m] = period.split("-").map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export async function GET(req: Request) {
  const result = await getMobilePaymentStaffRequest(req)
  if (!result.ok) return result.response

  const { buildingIds } = result
  const period = new Date().toISOString().slice(0, 7)
  const scopedBuildings = buildingIds.length > 0 ? buildingIds : ["__none__"]
  const monthNum = Number(period.split("-")[1])
  const isWinter = WINTER_MONTHS.includes(monthNum)
  const variableCats = isWinter ? ["ELECTRICITY", "WATER", "HEATING"] : ["ELECTRICITY", "WATER"]
  const prevPeriod = prevPeriodOf(period)

  const [expenses, totalAgg, recurring, buildings, curVar, prevVar] = await Promise.all([
    db.expense.findMany({
      where: { buildingId: { in: scopedBuildings }, period },
      select: { id: true, category: true, amount: true, description: true, date: true, buildingId: true, recurringExpenseId: true },
      orderBy: { date: "desc" },
      take: 50,
    }),
    db.expense.aggregate({ where: { buildingId: { in: scopedBuildings }, period }, _sum: { amount: true } }),
    db.recurringExpense.findMany({
      where: { buildingId: { in: scopedBuildings }, isActive: true },
      select: { id: true, amount: true },
    }),
    db.building.findMany({
      where: { id: { in: scopedBuildings }, isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    db.expense.groupBy({
      by: ["category"],
      where: { buildingId: { in: scopedBuildings }, period, category: { in: variableCats } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.expense.groupBy({
      by: ["category"],
      where: { buildingId: { in: scopedBuildings }, period: prevPeriod, category: { in: variableCats } },
      _sum: { amount: true },
    }),
  ])

  const entered = new Set(curVar.filter((r) => (r._count?._all ?? 0) > 0).map((r) => r.category))
  const prevMap = new Map(prevVar.map((r) => [r.category, r._sum.amount ?? 0]))

  return NextResponse.json({
    period,
    summary: {
      totalExpenses: totalAgg._sum.amount ?? 0,
      recurringActiveCount: recurring.length,
      recurringMonthlyTotal: recurring.reduce((s, r) => s + r.amount, 0),
    },
    expenses: expenses.map((e) => ({
      ...e,
      categoryLabel: expenseCategoryLabel(e.category),
      isRecurring: !!e.recurringExpenseId,
    })),
    variable: variableCats.map((cat) => ({
      category: cat,
      label: expenseCategoryLabel(cat),
      entered: entered.has(cat),
      lastAmount: prevMap.get(cat) ?? null,
    })),
    buildings,
    categories: Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => ({ value, label })),
  })
}

export async function POST(req: Request) {
  const result = await getMobilePaymentStaffRequest(req)
  if (!result.ok) return result.response

  const { buildingIds } = result
  const body = (await req.json().catch(() => null)) as {
    buildingId?: string
    category?: string
    amount?: unknown
    description?: string
    period?: string
  } | null
  if (!body) return mobileError("Некорректный запрос")

  const buildingId = String(body.buildingId ?? "").trim()
  if (!buildingId || !buildingIds.includes(buildingId)) {
    return mobileError("Выберите доступное здание")
  }
  const category = String(body.category ?? "").trim()
  if (!EXPENSE_CATEGORIES[category]) return mobileError("Неизвестная категория расхода")

  const amount = parsePositiveAmount(body.amount)
  if (!amount) return mobileError("Введите корректную сумму расхода")

  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(body.period ?? "")
    ? body.period!
    : new Date().toISOString().slice(0, 7)
  const description = String(body.description ?? "").trim().slice(0, 300) || null

  const expense = await db.expense.create({
    data: { buildingId, category, amount, description, period, date: new Date() },
    select: { id: true, category: true, amount: true, description: true, date: true, buildingId: true },
  })

  return NextResponse.json(
    { data: { ...expense, categoryLabel: expenseCategoryLabel(expense.category), isRecurring: false } },
    { status: 201 },
  )
}
