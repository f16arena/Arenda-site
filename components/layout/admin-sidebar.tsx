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
  Menu, X, Rocket, CircleHelp, HardDrive, UserCog, Sparkles,
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
}
type NavSection = {
  title?: string
  items: NavItem[]
  ownerOnly?: boolean
  /** Свёрнутая по умолчанию секция (раскрывается по клику). Состояние
   *  сохраняется в localStorage по ключу `sidebar:section:<title>`. */
  collapsible?: boolean
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
      { href: "/admin/documents", label: "Все документы", icon: FileText, section: "documents" },
      { href: "/admin/storage", label: "Хранилище", icon: HardDrive, section: "documents" },
    ],
  },
  {
    title: "ОБСЛУЖИВАНИЕ",
    items: [
      { href: "/admin/requests", label: "Заявки", icon: ClipboardList, section: "requests" },
      { href: "/admin/tasks", label: "Задачи", icon: CheckSquare, section: "tasks" },
      { href: "/admin/messages", label: "Сообщения", icon: MessageSquare, section: "messages" },
      { href: "/admin/complaints", label: "Жалобы", icon: AlertCircle, section: "complaints" },
      { href: "/admin/emergency", label: "Экстренные контакты", icon: Phone, section: "settings" },
    ],
  },
  {
    title: "АНАЛИТИКА",
    items: [
      { href: "/admin/dashboard/owner", label: "Финансовый дашборд", icon: BarChart3, section: "analytics", ownerOnly: true },
      { href: "/admin/analytics", label: "Аналитика", icon: BarChart3, section: "analytics" },
      // /admin/data-quality удалён из sidebar — содержимое теперь в /admin/onboarding
      // (объединённый экран «Здоровье платформы»). Сама страница пока живёт по
      // прямой ссылке для обратной совместимости.
      // /admin/system-health удалён из admin sidebar — техническая страница,
      // доступна только в /superadmin/system-health для платформ-админа Turanix.
    ],
  },
  {
    title: "ПОМОЩЬ",
    items: [
      { href: "/admin/faq", label: "FAQ", icon: CircleHelp },
    ],
  },
  // НАСТРОЙКИ — collapsible, свёрнуто по умолчанию. Раньше эти пункты жили
  // в /admin/profile?tab=management, но владельцы не находили их там —
  // искали в sidebar. Возвращаем сюда, чтобы «настройки организации» были
  // там, где их ищут. Дубли с другими секциями (Здания/Финансы/Аналитика)
  // намеренно не переносим — они и так в sidebar.
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

export function AdminSidebar({
  buildingName, userRole, allowedSections, allowedCapabilities, isPlatformOwner = false,
}: {
  buildingName?: string
  userRole?: string
  allowedSections?: string[]
  allowedCapabilities?: string[]
  isPlatformOwner?: boolean
}) {
  const pathname = usePathname()
  const isOwner = userRole === "OWNER"
  const allowed = new Set(allowedSections ?? [])
  const capabilities = new Set(allowedCapabilities ?? [])
  const [mobileOpen, setMobileOpen] = useState(false)
  // Collapsible-секции: ключ — title секции. Дефолтное состояние
  // (свёрнуто/раскрыто) приходит из логики ниже — если активный путь
  // внутри секции, она раскрывается. Иначе читаем из localStorage.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  // Hydration-flag: на сервере {} → SSR HTML, на клиенте при первом рендере
  // подгружаем из localStorage и обновляем state. Используем паттерн
  // «adjusting state during render» (React 18+) вместо useEffect —
  // ESLint правило react-hooks/set-state-in-effect блокирует setState
  // внутри эффекта. Этот паттерн идиоматичен и React сам перерендерит
  // без cascading effects. См. react.dev/learn/you-might-not-need-an-effect.
  const [hydrated, setHydrated] = useState(false)
  if (!hydrated) {
    setHydrated(true)
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("sidebar:collapsed")
        if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>)
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
        "flex h-full flex-col bg-slate-900 z-50 transition-transform",
        // Десктоп: всегда виден слева 60w
        "lg:relative lg:w-60 lg:translate-x-0",
        // Мобиль: фиксированный drawer
        "fixed top-0 left-0 w-64 -translate-x-full",
        mobileOpen && "translate-x-0"
      )}>
      {/* Кнопка закрыть на мобиле */}
      <button
        onClick={() => setMobileOpen(false)}
        className="lg:hidden absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-800"
        aria-label="Закрыть меню"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Building className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {buildingName ?? "Commrent"}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Панель управления</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {visibleNav.map((section, si) => {
          // Активный путь внутри секции — раскрываем принудительно,
          // даже если пользователь её свернул. Это уберегает от ситуации
          // «зашёл по ссылке, а в sidebar её нет — кажется что страница потеряна».
          const hasActive = section.items.some((it) => isActive(it.href, it.exact))
          const userCollapsed = section.title ? collapsed[section.title] : false
          // По умолчанию collapsible-секции свёрнуты (если в localStorage
          // нет явной записи), обычные — всегда раскрыты.
          const isExplicitState = section.title ? section.title in collapsed : false
          const defaultCollapsed = section.collapsible && !isExplicitState
          const isCollapsed = !hasActive && (userCollapsed ?? defaultCollapsed)

          return (
            <div key={si}>
              {section.title && section.collapsible ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.title!)}
                  className="w-full px-2 mb-1 flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase hover:text-slate-300 transition-colors"
                  aria-expanded={!isCollapsed}
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      isCollapsed && "-rotate-90"
                    )}
                  />
                </button>
              ) : section.title ? (
                <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
                  {section.title}
                </p>
              ) : null}
              {!isCollapsed && (
                <ul className="space-y-0.5">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          isActive(item.href, "exact" in item ? item.exact : undefined)
                            ? "bg-blue-600/20 text-white border-l-2 border-blue-500 pl-[10px]"
                            : "text-slate-400 dark:text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      {/* Logout: API route → browser выполняет полную навигацию,
          получает Set-Cookie с очисткой и редирект на корневой /login.
          Server action не используется, потому что он непредсказуемо
          взаимодействует с cookie на slug-поддоменах. */}
      <div className="border-t border-slate-800 p-3">
        <form action="/api/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 dark:text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </form>
      </div>
      </div>
    </>
  )
}
