import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { ru } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Русский формат без учёта языка интерфейса. Для экрана есть formatMoneyL /
// formatDateL из lib/i18n/format.ts; эти две остаются для ТЕКСТА ДОКУМЕНТОВ,
// который до вычитки юриста печатается по-русски.
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return format(new Date(date), "d MMMM yyyy", { locale: ru })
}

export const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  ADMIN: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  ACCOUNTANT: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  FACILITY_MANAGER: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  EMPLOYEE: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  TENANT: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
}

// Подписи для ОТЧЁТОВ и выгрузок (lib/reports, экспорт в 1С) — там язык задан
// форматом файла, а не пользователем. На экране подписи берутся из
// domain.chargeTypes / adminFinance.expenseCategories.
export const CHARGE_TYPES: Record<string, string> = {
  RENT: "Аренда",
  DEPOSIT: "Гарантийный депозит",
  DEPOSIT_REFUND: "Возврат депозита",
  SERVICE_FEE: "Эксплуатационный сбор",
  ELECTRICITY: "Электричество",
  WATER: "Вода",
  HEATING: "Отопление",
  GARBAGE: "Вывоз мусора",
  SECURITY: "Охрана",
  INTERNET: "Интернет",
  GAS: "Газ",
  CLEANING: "Уборка",
  PENALTY: "Штраф/пеня",
  OTHER: "Прочее",
}

// Категории расходов (Expense.category). Отличаются от CHARGE_TYPES: тут есть
// зарплата/ремонт, нет аренды/депозита. Используется в форме расхода, списке
// расходов и в постоянных расходах.
export const EXPENSE_CATEGORIES: Record<string, string> = {
  SALARY: "Зарплата",
  GARBAGE: "Вывоз мусора",
  CLEANING: "Уборка / техничка",
  INTERNET: "Интернет",
  SECURITY: "Охрана",
  ELECTRICITY: "Электроэнергия",
  WATER: "Водоснабжение",
  HEATING: "Отопление",
  GAS: "Газ",
  REPAIR: "Ремонт",
  OTHER: "Прочее",
}

export function expenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORIES[category] ?? category
}

// Зимние месяцы по умолчанию (окт–апр) — для сезонных постоянных расходов
// (отопление). Совпадает с дефолтом эксплуатационного сбора здания.
export const RECURRING_WINTER_MONTHS = "10,11,12,1,2,3,4"

export const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  DONE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  CLOSED: "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-300",
  POSTPONED: "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-300",
  DRAFT: "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-300",
  SENT: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  SIGNED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  ARCHIVED: "bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-300",
  VACANT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  OCCUPIED: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  MAINTENANCE: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
}

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-300",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
}

export const CHART_COLORS = {
  revenue: "#10b981",  // emerald-500
  expense: "#ef4444",  // red-500
  profit: "#3b82f6",   // blue-500
  neutral: "#94a3b8",  // slate-400
  warning: "#f59e0b",  // amber-500
} as const
