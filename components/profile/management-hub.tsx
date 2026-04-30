import Link from "next/link"
import {
  Building, LayoutGrid, Users, Shield, Package,
  Gauge, Settings, ArrowRight, Wallet, BarChart3, Mail,
  TrendingUp, History, ShieldCheck,
} from "lucide-react"

interface Stats {
  buildings?: number
  spaces?: number
  staff?: number
  tenants?: number
}

/**
 * Хаб быстрых ссылок на разделы управления для OWNER-а.
 * Показывает все ключевые секции одним списком — пользователь
 * не должен искать их в сайдбаре.
 */
export function ManagementHub({ stats }: { stats?: Stats }) {
  const cards = [
    {
      href: "/admin/buildings",
      icon: Building,
      label: "Здания",
      description: "Адреса, корпуса, базовые ставки",
      count: stats?.buildings,
      color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      href: "/admin/spaces",
      icon: LayoutGrid,
      label: "Помещения",
      description: "Кабинеты, этажи, площади",
      count: stats?.spaces,
      color: "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    },
    {
      href: "/admin/staff",
      icon: Users,
      label: "Сотрудники",
      description: "Команда, оклады, доступы",
      count: stats?.staff,
      color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      href: "/admin/roles",
      icon: Shield,
      label: "Роли и доступы",
      description: "Права для каждой роли",
      color: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
    },
    {
      href: "/admin/subscription",
      icon: Package,
      label: "Подписка",
      description: "Текущий тариф, продление, история",
      color: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      href: "/admin/settings",
      icon: Settings,
      label: "Настройки организации",
      description: "Реквизиты, НДС, банковские данные",
      color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500",
    },
    {
      href: "/admin/meters",
      icon: Gauge,
      label: "Счётчики",
      description: "Электричество, вода — приборы учёта",
      color: "bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400",
    },
    {
      href: "/admin/finances",
      icon: Wallet,
      label: "Финансы",
      description: "Сводка, начисления, платежи",
      color: "bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400",
    },
    {
      href: "/admin/analytics",
      icon: BarChart3,
      label: "Аналитика",
      description: "Доходы, заполняемость, отчёты",
      color: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400",
    },
    {
      href: "/admin/email-logs",
      icon: Mail,
      label: "Журнал email",
      description: "История отправки писем, статусы доставки",
      color: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    },
    {
      href: "/admin/leads",
      icon: TrendingUp,
      label: "Лиды (CRM)",
      description: "Потенциальные арендаторы, воронка продаж",
      color: "bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400",
    },
    {
      href: "/admin/contracts",
      icon: ShieldCheck,
      label: "Договоры (отдельный список)",
      description: "Договоры также видны в «Все документы»",
      color: "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      href: "/admin/users",
      icon: Users,
      label: "Все пользователи",
      description: "Полный список аккаунтов организации",
      color: "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400",
    },
    {
      href: "/admin/audit",
      icon: History,
      label: "Журнал операций",
      description: "История всех действий пользователей",
      color: "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <Link
            key={c.href}
            href={c.href}
            className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 hover:border-slate-300 hover:shadow-sm transition flex items-start gap-3"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${c.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {c.label}
                  {c.count !== undefined && (
                    <span className="ml-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">· {c.count}</span>
                  )}
                </p>
                <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-600 dark:text-slate-400 dark:text-slate-500 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{c.description}</p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
