import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { ru } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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

export function formatPeriod(period: string): string {
  const [year, month] = period.split("-")
  const date = new Date(Number(year), Number(month) - 1)
  return format(date, "LLLL yyyy", { locale: ru })
}

export const ROLES = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  ACCOUNTANT: "Бухгалтер",
  FACILITY_MANAGER: "Завхоз",
  EMPLOYEE: "Сотрудник",
  TENANT: "Арендатор",
} as const

export const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  ADMIN: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  ACCOUNTANT: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  FACILITY_MANAGER: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  EMPLOYEE: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  TENANT: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
}

export const CHARGE_TYPES: Record<string, string> = {
  RENT: "Аренда",
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

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  TRANSFER: "Банковский перевод",
  KASPI: "Kaspi",
  CASH: "Наличные",
  CARD: "Карта",
}

export const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  DONE: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-slate-100 text-slate-500",
  POSTPONED: "bg-slate-100 text-slate-500",
  DRAFT: "bg-slate-100 text-slate-500",
  SENT: "bg-blue-100 text-blue-700",
  SIGNED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  ARCHIVED: "bg-slate-100 text-slate-400",
  VACANT: "bg-emerald-100 text-emerald-700",
  OCCUPIED: "bg-blue-100 text-blue-700",
  MAINTENANCE: "bg-amber-100 text-amber-700",
  PENDING: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
}

export const STATUS_LABELS: Record<string, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CLOSED: "Закрыта",
  POSTPONED: "Отложена",
  DRAFT: "Черновик",
  SENT: "Отправлен",
  SIGNED: "Подписан",
  REJECTED: "Отклонён",
  ARCHIVED: "Архив",
  VACANT: "Свободно",
  OCCUPIED: "Занято",
  MAINTENANCE: "Обслуживание",
  PENDING: "Ожидает",
  PAID: "Оплачено",
}

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-500",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
}

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
  URGENT: "Срочный",
}

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  TECHNICAL: "Техническая",
  INTERNET: "Интернет",
  CLEANING: "Уборка",
  QUESTION: "Вопрос",
  OTHER: "Прочее",
}

export const LEGAL_TYPE_LABELS: Record<string, string> = {
  IP: "ИП",
  CHSI: "ЧСИ",
  TOO: "ТОО",
  AO: "АО",
  PHYSICAL: "Физическое лицо",
  INDIVIDUAL: "Физическое лицо",
}

export const CHART_COLORS = {
  revenue: "#10b981",  // emerald-500
  expense: "#ef4444",  // red-500
  profit: "#3b82f6",   // blue-500
  neutral: "#94a3b8",  // slate-400
  warning: "#f59e0b",  // amber-500
} as const
