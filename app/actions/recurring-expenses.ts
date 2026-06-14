"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingAccess } from "@/lib/building-access"
import { assertRecurringExpenseInOrg } from "@/lib/scope-guards"
import { EXPENSE_CATEGORIES, RECURRING_WINTER_MONTHS } from "@/lib/utils"
import { generateRecurringExpensesForOrg, parseMonths } from "@/lib/recurring-expenses"

const CURRENT_PERIOD = () => new Date().toISOString().slice(0, 7)

function revalidate() {
  revalidatePath("/admin/finances")
  revalidatePath("/admin/finances/recurring")
  revalidatePath("/admin/finances/balance")
}

// Создаёт шаблон постоянного расхода и сразу генерирует расход за текущий месяц
// (если месяц подходит), чтобы он появился в списке без ожидания cron-а.
export async function addRecurringExpense(formData: FormData) {
  await requireCapabilityAndFeature("finance.manageExpenses")
  const { orgId } = await requireOrgAccess()

  const selectedBuildingId = String(formData.get("buildingId") ?? "").trim()
  const buildingId = (await getCurrentBuildingId()) ?? selectedBuildingId
  if (!buildingId) return { error: "Здание не выбрано" }
  await assertBuildingAccess(buildingId, orgId)

  const category = String(formData.get("category") ?? "").trim()
  if (!EXPENSE_CATEGORIES[category]) return { error: "Неизвестная категория расхода" }

  const amount = parseFloat(String(formData.get("amount") ?? "").replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Сумма расхода должна быть положительным числом" }
  }

  const description = String(formData.get("description") ?? "").trim() || null

  const dayRaw = parseInt(String(formData.get("dayOfMonth") ?? "1"), 10)
  const dayOfMonth = Number.isFinite(dayRaw) ? Math.min(Math.max(dayRaw, 1), 28) : 1

  // schedule: "always" | "winter" — зимний период хранится как CSV месяцев.
  const schedule = String(formData.get("schedule") ?? "always")
  const months = schedule === "winter" ? RECURRING_WINTER_MONTHS : null
  if (months && !parseMonths(months)) return { error: "Некорректный период" }

  const cashAccountId = String(formData.get("cashAccountId") ?? "").trim() || null
  if (cashAccountId) {
    const acc = await db.cashAccount.findUnique({
      where: { id: cashAccountId },
      select: { organizationId: true },
    })
    if (!acc || acc.organizationId !== orgId) {
      return { error: "Указан недействительный счёт" }
    }
  }

  await db.recurringExpense.create({
    data: { buildingId, category, amount, description, dayOfMonth, months, cashAccountId },
  })

  // Сразу создаём расход за текущий месяц (генератор сам проверит сезонность и дедуп).
  await generateRecurringExpensesForOrg(orgId, CURRENT_PERIOD())

  revalidate()
  return { success: true }
}

export async function toggleRecurringExpense(id: string, isActive: boolean) {
  await requireCapabilityAndFeature("finance.manageExpenses")
  const { orgId } = await requireOrgAccess()
  await assertRecurringExpenseInOrg(id, orgId)

  await db.recurringExpense.update({ where: { id }, data: { isActive } })
  revalidate()
  return { success: true }
}

// Удаляет шаблон. Уже созданные расходы остаются (recurring_expense_id → NULL).
export async function deleteRecurringExpense(id: string) {
  await requireCapabilityAndFeature("finance.manageExpenses")
  const { orgId } = await requireOrgAccess()
  await assertRecurringExpenseInOrg(id, orgId)

  await db.recurringExpense.delete({ where: { id } })
  revalidate()
  return { success: true }
}

// Ручная генерация расходов из всех активных шаблонов за указанный период.
export async function generateRecurringExpensesNow(period?: string) {
  await requireCapabilityAndFeature("finance.manageExpenses")
  const { orgId } = await requireOrgAccess()
  const safePeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(period ?? "") ? period! : CURRENT_PERIOD()

  const result = await generateRecurringExpensesForOrg(orgId, safePeriod)
  revalidate()
  return { ...result, period: safePeriod }
}
