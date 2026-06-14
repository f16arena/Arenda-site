import { NextResponse } from "next/server"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { generateRecurringExpensesForAllOrgs } from "@/lib/recurring-expenses"

export const dynamic = "force-dynamic"

// Запускается 1-го числа каждого месяца и создаёт расходы из шаблонов
// постоянных расходов (зарплата, вывоз мусора, техничка, интернет,
// отопление-зимой) за текущий период. Дедуп — на уникальном индексе,
// так что повторный запуск безопасен.
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const now = new Date()
  const period = now.toISOString().slice(0, 7) // YYYY-MM

  try {
    const result = await generateRecurringExpensesForAllOrgs(period)
    return NextResponse.json({ ok: true, period, ...result, ranAt: now.toISOString() })
  } catch (e) {
    return NextResponse.json(
      { ok: false, period, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    )
  }
}
