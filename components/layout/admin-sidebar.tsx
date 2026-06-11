"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import {
  LayoutDashboard, Users, Building2, Wallet, Gauge,
  FileText, ClipboardList, CheckSquare,
  MessageSquare, AlertCircle, Phone, BarChart3,
  Shield, Package, Settings as SettingsIcon,
  Mail, History, TrendingUp,
  LogOut, Building,
  CalendarDays, ChevronDown,
  Menu, X, Rocket, CircleHelp, HardDrive, UserCog, Sparkles, FileBarChart,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
  ownerOnly?: boolean
  /** Виден только платформ-админу (isPlatformOwner=true). Для тех.страниц. */
  platformOnly?: boolean
  section?: string
  capability?: string
  /** Ключ живого счётчика из /api/admin/nav-counters */
  counter?: CounterKey
}
type NavSection = {
  title?: string
  items: NavItem[]
  ownerOnly?: boolean
  /** Свёрнутая по умолчанию секция (раскрывается по клику). Состояние
   *  сохраняется в localStorage по ключу `sidebar:collapsed`. */
  collapsible?: boolean
}

type CounterKey = "requests" | "messages" | "tasks" | "complaints" | "documents"
type Counters = Partial<Record<CounterKey, number>>

/** Цвет бейджа: красный — требует реакции, синий — входящие, янтарный — в работе */
const COUNTER_STYLE: Record<CounterKey, string> = {
  requests: "bg-red-500 text-white",
  complaints: "bg-red-500 text-white",
  messages: "bg-blue-500 text-white",
  tasks: "bg-amber-500 text-slate-900",
  documents: "bg-violet-500 text-white",
}

const ROLE_RU: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  ACCOUNTANT: "Бухгалтер",
  STAFF: "Сотрудник",
}

const nav: NavSection[] = [
  {
    // /admin/ops удалён из sidebar — операционные действия уже на главной (/admin).
    // /admin/onboarding объединён с /admin/data-quality в «Здоровье платформы».
    items: [
      { href: "/admin", label: "Обзор", icon: LayoutDashboard, exact: true, section: "dashboard" },
      { href: "/admin/calendar", label: "Календарь", icon: CalendarDays, section: "dashboard" },
      { href: "/admin/onboarding", label: "Здоровье платформы", icon: Rocket, section: "dashboard" },
    ],
  },
  {
    title: "ОБЪЕКТЫ",
    items: [
      { href: "/admin/buildings", label: "Здания", icon: Building, section: "buildings" },
      { href: "/admin/spaces", label: "Помещения", icon: Building2, section: "spaces" },
      { href: "/admin/meters", label: "Счётчики", icon: Gauge, section: "meters" },
    ],
  },
  {
    title: "АРЕНДА",
    items: [
      { href: "/admin/tenants", label: "Арендаторы", icon: Users, section: "tenants" },
    ],
  },
  {
    title: "ФИНАНСЫ",
    items: [
      { href: "/admin/finances", label: "Финансы", icon: Wallet, section: "finances" },
      { href: "/admin/service-fee", label: "Эксплуатационный сбор", icon: Sparkles, section: "buildings" },
    ],
  },
  {
    title: "ДОКУМЕНТЫ",
    items: [
      { href: "/admin/documents", label: "Все документы", icon: FileText, section: "documents", counter: "documents" },
      { href: "/admin/storage", label: "Хранилище", icon: HardDrive, section: "documents" },
    ],
  },
  {
    title: "ОБСЛУЖИВАНИЕ",
    items: [
      { href: "/admin/requests", label: "Заявки", icon: ClipboardList, section: "requests", counter: "requests" },
      { href: "/admin/tasks", label: "Задачи", icon: CheckSquare, section: "tasks", counter: "tasks" },
      { href: "/admin/messages", label: "Сообщения", icon: MessageSquare, section: "messages", counter: "messages" },
      { href: "/admin/complaints", label: "Жалобы", icon: AlertCircle, section: "complaints", counter: "complaints" },
      { href: "/admin/emergency", label: "Экстренные контакты", icon: Phone, section: "settings" },
    ],
  },
  {
    title: "АНАЛИТИКА",
    items: [
      { href: "/admin/dashboard/owner", label: "Финансовый дашборд", icon: BarChart3, section: "analytics", ownerOnly: true },
      { href: "/admin/reports", label: "Отчётность", icon: FileBarChart, section: "analytics", ownerOnly: true },
      { href: "/admin/analytics", label: "Аналитика", icon: BarChart3, section: "analytics" },
      // /admin/data-quality и /admin/system-health убраны из sidebar — см. историю в git.
    ],
  },
  {
    title: "ПОМОЩЬ",
    items: [
      { href: "/admin/faq", label: "FAQ", icon: CircleHelp },
    ],
  },
  // НАСТРОЙКИ — collapsible, свёрнуто по умолчанию.
  {
    title: "НАСТРОЙКИ",
    ownerOnly: true,
    collapsible: true,
    items: [
      { href: "/admin/settings", label: "Настройки организации", icon: SettingsIcon, section: "settings" },
      { href: "/admin/staff", label: "Сотрудники", icon: Users, section: "staff" },
      { href: "/admin/roles", label: "Роли и доступы", icon: Shield, section: "settings" },
      { href: "/admin/subscription", label: "Подписка и тариф", icon: Package, section: "settings" },
      { href: "/admin/leads", label: "Лиды (CRM)", icon: TrendingUp, section: "leads" },
      { href: "/admin/users", label: "Все пользователи", icon: UserCog, section: "users" },
      { href: "/admin/email-logs", label: "Журнал email", icon: Mail, section: "settings" },
      { href: "/admin/audit", label: "Журнал операций", icon: History, section: "settings" },
    ],
  },
]

function formatBadge(n: number): string {
  return n > 99 ? "99+" : String(n)
}

export function AdminSidebar({
  buildingName, userRole, userName, allowedSections, allowedCapabilities, isPlatformOwner = false,
}: {
  buildingName?: string
  userRole?: string
  userName?: string | null
  allowedSections?: string[]
  allowedCapabilities?: string[]
  isPlatformOwner?: boolean
}) {
  const pathname = usePathname()
  const isOwner = userRole === "OWNER"
  const allowed = new Set(allowedSections ?? [])
  const capabilities = new Set(allowedCapabilities ?? [])
  const [mobileOpen, setMobileOpen] = useState(false)
  // Узкая «рейка» иконок на десктопе (lg+); на мобиле drawer всегда полный.
  const [rail, setRail] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [counters, setCounters] = useState<Counters>({})
  // Hydration-flag: на сервере {} → SSR HTML, на клиенте при первом рендере
  // подгружаем из localStorage и обновляем state. Паттерн «adjusting state
  // during render» (react.dev/learn/you-might-not-need-an-effect) — ESLint
  // правило react-hooks/set-state-in-effect блокирует setState в эффекте.
  const [hydrated, setHydrated] = useState(false)
  if (!hydrated) {
    setHydrated(true)
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("sidebar:collapsed")
        if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>)
        if (window.localStorage.getItem("sidebar:rail") === "1") setRail(true)
      } catch {
        // localStorage может быть недоступен (приватный режим) — игнорируем.
      }
    }
  }

  // Закрываем drawer при смене URL
  useEffect(() => {
    const id = window.setTimeout(() => setMobileOpen(false), 0)
    return () => window.clearTimeout(id)
  }, [pathname])

  // Живые счётчики: при загрузке, раз в 60с и при возврате на вкладку.
  useEffect(() => {
    let cancelled = false
    const load = () => {
      if (document.visibilityState === "hidden") return
      fetch("/api/admin/nav-counters")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: Counters | null) => {
          if (!cancelled && data) setCounters(data)
        })
        .catch(() => { /* сеть/авторизация — бейджи просто не покажем */ })
    }
    load()
    const interval = window.setInterval(load, 60_000)
    document.addEventListener("visibilitychange", load)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", load)
    }
  }, [])

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  function toggleSection(title: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [title]: !prev[title] }
      try {
        window.localStorage.setItem("sidebar:collapsed", JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  function toggleRail() {
    setRail((prev) => {
      try {
        window.localStorage.setItem("sidebar:rail", prev ? "0" : "1")
      } catch {
        // ignore
      }
      return !prev
    })
  }

  // Фильтруем секции по правам
  const visibleNav = nav
    .filter((s) => !s.ownerOnly || isOwner)
    .map((s) => ({
      ...s,
      items: s.items.filter((item) => {
        // platformOnly — самое строгое: даже OWNER не видит, если не платформа.
        if (item.platformOnly && !isPlatformOwner) return false
        if (item.ownerOnly && !isOwner) return false
        if (isOwner) return true
        if (item.section && !allowed.has(item.section)) return false
        if (item.capability && !capabilities.has(item.capability)) return false
        return true
      }),
    }))
    .filter((s) => s.items.length > 0)

  const initials = (userName ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?"
  const roleLabel = (userRole && ROLE_RU[userRole]) ?? userRole ?? ""

  return (
    <>
      {/* Кнопка-гамбургер на мобиле — фиксирована в шапке */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shadow-lg"
        aria-label="Открыть меню"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Затемнение фона на мобиле */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className={cn(
        "flex h-full flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 z-50",
        "transition-[width,transform] duration-300 ease-out",
        // Десктоп: всегда виден слева; ширина зависит от режима рейки
        "lg:relative lg:translate-x-0",
        rail ? "lg:w-[72px]" : "lg:w-60",
        // Мобиль: фиксированный drawer (всегда полная ширина)
        "fixed top-0 left-0 w-64 -translate-x-full",
        mobileOpen && "translate-x-0"
      )}>
      {/* Кнопка закрыть на мобиле */}
      <button
        onClick={() => setMobileOpen(false)}
        className="lg:hidden absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
        aria-label="Закрыть меню"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Logo */}
      <div className={cn(
        "flex items-center gap-3 border-b border-slate-800/80 px-5 py-5",
        rail && "lg:justify-center lg:px-2",
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-md shadow-blue-950/50">
          <Building className="h-4 w-4 text-white" />
        </div>
        <div className={cn("min-w-0", rail && "lg:hidden")}>
          <p className="text-sm font-semibold text-white truncate">
            {buildingName ?? "Commrent"}
          </p>
          <p className="text-[11px] text-slate-400">Панель управления</p>
        </div>
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 overflow-y-auto py-4 px-3 space-y-4", rail && "lg:px-2 lg:space-y-2")}>
        {visibleNav.map((section, si) => {
          // Активный путь внутри секции — раскрываем принудительно,
          // даже если пользователь её свернул.
          const hasActive = section.items.some((it) => isActive(it.href, it.exact))
          const userCollapsed = section.title ? collapsed[section.title] : false
          const isExplicitState = section.title ? section.title in collapsed : false
          const defaultCollapsed = section.collapsible && !isExplicitState
          const isCollapsed = !hasActive && (userCollapsed ?? defaultCollapsed)
          // Сумма счётчиков внутри свёрнутой секции — чтобы цифры не терялись
          const sectionCount = section.items.reduce(
            (sum, it) => sum + (it.counter ? counters[it.counter] ?? 0 : 0),
            0,
          )

          return (
            <div key={si}>
              {section.title ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.title!)}
                  className={cn(
                    "w-full px-2 mb-1 flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-500 uppercase transition-colors hover:text-slate-300",
                    rail && "lg:hidden",
                  )}
                  aria-expanded={!isCollapsed}
                >
                  <span className="flex items-center gap-1.5">
                    {section.title}
                    {isCollapsed && sectionCount > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white normal-case tracking-normal">
                        {formatBadge(sectionCount)}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform duration-200", isCollapsed && "-rotate-90")}
                  />
                </button>
              ) : null}
              {/* Разделитель между секциями в режиме рейки */}
              {section.title && si > 0 && rail && (
                <div className="hidden lg:block mx-3 mb-2 border-t border-slate-800/80" />
              )}
              {/* grid-rows трюк: плавное сворачивание без измерения высоты.
                  В режиме рейки секции на десктопе всегда раскрыты (заголовков нет). */}
              <div className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                rail && "lg:grid-rows-[1fr]",
              )}>
                <ul className="overflow-hidden space-y-0.5">
                  {section.items.map((item) => {
                    const active = isActive(item.href, "exact" in item ? item.exact : undefined)
                    const count = item.counter ? counters[item.counter] ?? 0 : 0
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          title={item.label}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                            "transition-all duration-200",
                            rail && "lg:justify-center lg:px-0 lg:py-2.5",
                            active
                              ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-950/40"
                              : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100 hover:translate-x-0.5",
                            active && rail && "lg:from-blue-600 lg:to-blue-600",
                          )}
                        >
                          <span className="relative shrink-0">
                            <item.icon className={cn(
                              "h-4 w-4 transition-transform duration-200",
                              !active && "group-hover:scale-110",
                            )} />
                            {/* Бейдж-точка на иконке в режиме рейки */}
                            {count > 0 && (
                              <span className={cn(
                                "hidden",
                                rail && "lg:flex absolute -top-1.5 -right-2 h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold leading-none",
                                rail && COUNTER_STYLE[item.counter!],
                              )}>
                                {formatBadge(count)}
                              </span>
                            )}
                          </span>
                          <span className={cn("truncate", rail && "lg:hidden")}>{item.label}</span>
                          {/* Бейдж-пилюля в полном режиме */}
                          {count > 0 && (
                            <span className={cn(
                              "ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none",
                              COUNTER_STYLE[item.counter!],
                              active && "bg-white/25 text-white",
                              rail && "lg:hidden",
                            )}>
                              {formatBadge(count)}
                            </span>
                          )}
                          {/* Тултип в режиме рейки */}
                          <span className={cn(
                            "pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs text-white shadow-lg",
                            rail && "lg:group-hover:block",
                          )}>
                            {item.label}{count > 0 ? ` · ${formatBadge(count)}` : ""}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )
        })}
      </nav>

      {/* Футер: профиль + рейка + выход.
          Logout через API route → браузер делает полную навигацию, получает
          Set-Cookie с очисткой и редирект на корневой /login. Server action
          не используется — непредсказуем с cookie на slug-поддоменах. */}
      <div className={cn("border-t border-slate-800/80 p-3 space-y-1", rail && "lg:p-2")}>
        <button
          type="button"
          onClick={toggleRail}
          className={cn(
            "hidden lg:flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-800/80 hover:text-slate-200",
            rail && "lg:justify-center lg:px-0",
          )}
          title={rail ? "Развернуть меню" : "Свернуть в иконки"}
        >
          {rail ? <PanelLeftOpen className="h-4 w-4 shrink-0" /> : <PanelLeftClose className="h-4 w-4 shrink-0" />}
          <span className={cn(rail && "lg:hidden")}>Свернуть меню</span>
        </button>

        <div className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-2",
          rail && "lg:flex-col lg:gap-2 lg:px-0",
        )}>
          <Link
            href="/admin/profile"
            title="Открыть профиль"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-bold text-white shadow-md shadow-blue-950/50 transition-transform hover:scale-105"
          >
            {initials}
          </Link>
          <div className={cn("min-w-0 flex-1", rail && "lg:hidden")}>
            <p className="truncate text-xs font-medium text-slate-200">{userName ?? "Профиль"}</p>
            {roleLabel && <p className="truncate text-[10px] text-slate-500">{roleLabel}</p>}
          </div>
          <form action="/api/logout" method="post" className="shrink-0">
            <button
              type="submit"
              title="Выйти"
              aria-label="Выйти"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800 hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
      </div>
    </>
  )
}
