import { db } from "@/lib/db"
import { isUniqueConstraintError } from "@/lib/prisma-errors"
import type { Prisma } from "@/app/generated/prisma/client"

// Парсит CSV месяцев "10,11,12,1,2,3,4" → Set<number>. Пустое/невалидное — null.
export function parseMonths(months: string | null | undefined): Set<number> | null {
  if (!months) return null
  const set = new Set(
    months
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12),
  )
  return set.size > 0 ? set : null
}

// Применяется ли постоянный расход к данному периоду (YYYY-MM)?
export function recurringAppliesToPeriod(months: string | null | undefined, period: string): boolean {
  const set = parseMonths(months)
  if (!set) return true // каждый месяц
  const month = Number(period.split("-")[1])
  return set.has(month)
}

// Дата расхода за период: dayOfMonth, обрезанный до последнего дня месяца.
function expenseDateForPeriod(period: string, dayOfMonth: number): Date {
  const [year, month] = period.split("-").map(Number)
  const lastDay = new Date(year, month, 0).getDate() // месяц 1..12 → последний день
  const day = Math.min(Math.max(Math.trunc(dayOfMonth) || 1, 1), lastDay)
  return new Date(year, month - 1, day)
}

type RecurringTemplate = {
  id: string
  buildingId: string
  category: string
  amount: number
  description: string | null
  dayOfMonth: number
  months: string | null
  cashAccountId: string | null
}

// Создаёт расход из одного шаблона за период (если ещё не создан и месяц подходит).
// Возвращает true, если расход был создан. Дедуп — на уникальном индексе
// (recurring_expense_id, period): параллельные cron+ручной запуск безопасны.
async function generateOneRecurringExpense(t: RecurringTemplate, period: string): Promise<boolean> {
  if (!recurringAppliesToPeriod(t.months, period)) return false

  const existing = await db.expense.findFirst({
    where: { recurringExpenseId: t.id, period },
    select: { id: true },
  })
  if (existing) return false

  const date = expenseDateForPeriod(period, t.dayOfMonth)
  const ops: Prisma.PrismaPromise<unknown>[] = [
    db.expense.create({
      data: {
        buildingId: t.buildingId,
        category: t.category,
        amount: t.amount,
        description: t.description,
        period,
        date,
        recurringExpenseId: t.id,
      },
    }),
  ]

  // Опциональное списание со счёта — как в addExpense.
  if (t.cashAccountId) {
    ops.push(
      db.cashTransaction.create({
        data: {
          accountId: t.cashAccountId,
          amount: -t.amount,
          type: "WITHDRAW",
          description: `Постоянный расход${t.description ? ` · ${t.description}` : ""}`,
        },
      }),
      db.cashAccount.update({
        where: { id: t.cashAccountId },
        data: { balance: { decrement: t.amount } },
      }),
    )
  }

  try {
    await db.$transaction(ops)
    return true
  } catch (e) {
    // Гонка: другой процесс уже создал расход за этот период — это норма.
    if (isUniqueConstraintError(e)) return false
    throw e
  }
}

const TEMPLATE_SELECT = {
  id: true,
  buildingId: true,
  category: true,
  amount: true,
  description: true,
  dayOfMonth: true,
  months: true,
  cashAccountId: true,
} as const

// Генерация постоянных расходов одной организации за период. Используется
// server action-ом (кнопка «Сгенерировать») и сразу после создания шаблона.
export async function generateRecurringExpensesForOrg(orgId: string, period: string) {
  const templates = await db.recurringExpense.findMany({
    where: { isActive: true, building: { organizationId: orgId } },
    select: TEMPLATE_SELECT,
  })

  let created = 0
  for (const t of templates) {
    if (await generateOneRecurringExpense(t, period)) created++
  }
  return { created, templates: templates.length }
}

// Генерация для всех активных организаций — вызывается cron-ом 1-го числа.
export async function generateRecurringExpensesForAllOrgs(period: string) {
  const templates = await db.recurringExpense.findMany({
    where: {
      isActive: true,
      building: { organization: { isActive: true, isSuspended: false } },
    },
    select: TEMPLATE_SELECT,
  })

  let created = 0
  for (const t of templates) {
    try {
      if (await generateOneRecurringExpense(t, period)) created++
    } catch {
      // Один сбойный шаблон не должен останавливать остальные.
    }
  }
  return { created, templates: templates.length }
}
