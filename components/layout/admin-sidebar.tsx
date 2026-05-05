"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import {
  LayoutDashboard, Users, Building2, Wallet, Gauge,
  FileText, ClipboardList, CheckSquare,
  MessageSquare, AlertCircle, Phone, BarChart3,
  ShieldCheck,
  LogOut, Building, Activity,
  CalendarDays, CirclePlus,
  Menu, X, Rocket, CircleHelp, HardDrive,
} from "lucide-react"
import { cn } from "@/lib/utils"

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; ownerOnly?: boolean; section?: string }
type NavSection = { title?: string; items: NavItem[]; ownerOnly?: boolean }

const nav: NavSection[] = [
  {
    items: [
      { href: "/admin", label: "Дашборд", icon: LayoutDashboard, exact: true, section: "dashboard" },
      { href: "/admin/ops", label: "Сегодня", icon: ClipboardList, section: "dashboard" },
      { href: "/admin/calendar", label: "Календарь", icon: CalendarDays, section: "dashboard" },
      { href: "/admin/onboarding", label: "Запуск", icon: Rocket, section: "dashboard" },
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
    ],
  },
  {
    title: "ДОКУМЕНТЫ",
    items: [
      { href: "/admin/documents", label: "Все документы", icon: FileText, section: "documents" },
      { href: "/admin/documents/new", label: "Создать документ", icon: CirclePlus, section: "documents" },
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
      { href: "/admin/analytics", label: "Аналитика", icon: BarChart3, section: "analytics" },
      { href: "/admin/data-quality", label: "Качество данных", icon: ShieldCheck, section: "analytics" },
      { href: "/admin/system-health", label: "Проверка системы", icon: Activity, section: "analytics" },
    ],
  },
  {
    title: "ПОМОЩЬ",
    items: [
      { href: "/admin/faq", label: "FAQ", icon: CircleHelp },
    ],
  },
  // Сотрудники / Подписка / Роли / Настройки организации / Импорт / Тарифы
  // вынесены в "Управление" внутри /admin/profile (видимо только OWNER-у).
  // Это упрощает sidebar, оставляя там только повседневные операционные разделы.
  // Доступ к профилю — через клик по имени в правом верхнем углу.
  // "Все пользователи" и "Журнал операций" перенесены в Management Hub профиля.
]

export function AdminSidebar({
  buildingName, userRole, allowedSections,
}: {
  buildingName?: string
  userRole?: string
  allowedSections?: string[]
}) {
  const pathname = usePathname()
  const isOwner = userRole === "OWNER"
  const allowed = new Set(allowedSections ?? [])
  const [mobileOpen, setMobileOpen] = useState(false)

  // Закрываем drawer при смене URL
  useEffect(() => {
    const id = window.setTimeout(() => setMobileOpen(false), 0)
    return () => window.clearTimeout(id)
  }, [pathname])

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  // Фильтруем секции по правам
  const visibleNav = nav
    .filter((s) => !s.ownerOnly || isOwner)
    .map((s) => ({
      ...s,
      items: s.items.filter((item) => {
        if (item.ownerOnly && !isOwner) return false
        if (isOwner) return true
        if (item.section && !allowed.has(item.section)) return false
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
        {visibleNav.map((section, si) => (
          <div key={si}>
            {section.title && (
              <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">
                {section.title}
              </p>
            )}
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
          </div>
        ))}
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
