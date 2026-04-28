"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Users, Building2, Wallet, Gauge,
  FileText, ClipboardList, CheckSquare, UserCog,
  MessageSquare, AlertCircle, Phone, BarChart3,
  LogOut, Building, Settings, Shield, ShieldCheck,
  TrendingUp, History,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { logout } from "@/app/actions/auth"

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; ownerOnly?: boolean; section?: string }
type NavSection = { title?: string; items: NavItem[]; ownerOnly?: boolean }

const nav: NavSection[] = [
  {
    items: [
      { href: "/admin", label: "Дашборд", icon: LayoutDashboard, exact: true, section: "dashboard" },
    ],
  },
  {
    title: "ОБЪЕКТЫ",
    items: [
      { href: "/admin/buildings", label: "Здания", icon: Building, section: "buildings" },
      { href: "/admin/spaces", label: "Помещения", icon: Building2, section: "spaces" },
    ],
  },
  {
    title: "АРЕНДА",
    items: [
      { href: "/admin/tenants", label: "Арендаторы", icon: Users, section: "tenants" },
      { href: "/admin/leads", label: "Лиды (CRM)", icon: TrendingUp, section: "tenants" },
    ],
  },
  {
    title: "ФИНАНСЫ",
    items: [
      { href: "/admin/finances", label: "Финансы", icon: Wallet, section: "finances" },
      { href: "/admin/meters", label: "Счётчики", icon: Gauge, section: "meters" },
    ],
  },
  {
    title: "ДОКУМЕНТЫ",
    items: [
      { href: "/admin/contracts", label: "Договоры", icon: FileText, section: "contracts" },
      { href: "/admin/documents", label: "Все документы", icon: FileText, section: "documents" },
      { href: "/admin/documents/templates/rental", label: "Шаблон договора", icon: FileText, section: "documents" },
      { href: "/admin/documents/templates/reconciliation", label: "Акт сверки", icon: BarChart3, section: "documents" },
    ],
  },
  {
    title: "ОБСЛУЖИВАНИЕ",
    items: [
      { href: "/admin/requests", label: "Заявки", icon: ClipboardList, section: "requests" },
      { href: "/admin/tasks", label: "Задачи", icon: CheckSquare, section: "tasks" },
    ],
  },
  {
    title: "ПЕРСОНАЛ",
    items: [
      { href: "/admin/staff", label: "Сотрудники", icon: UserCog, section: "staff" },
    ],
  },
  {
    title: "ПРОЧЕЕ",
    items: [
      { href: "/admin/messages", label: "Сообщения", icon: MessageSquare, section: "messages" },
      { href: "/admin/complaints", label: "Жалобы", icon: AlertCircle, section: "complaints" },
      { href: "/admin/emergency", label: "Экстренные", icon: Phone, section: "settings" },
      { href: "/admin/analytics", label: "Аналитика", icon: BarChart3, section: "analytics" },
      { href: "/admin/settings", label: "Настройки", icon: Settings, section: "settings" },
      { href: "/admin/roles", label: "Роли и доступ", icon: Shield, section: "roles" },
      { href: "/admin/profile", label: "Мой профиль", icon: UserCog, section: "profile" },
    ],
  },
  {
    title: "СУПЕР-АДМИН",
    ownerOnly: true,
    items: [
      { href: "/admin/users", label: "Все пользователи", icon: ShieldCheck, ownerOnly: true, section: "users" },
      { href: "/admin/audit", label: "Журнал операций", icon: History, ownerOnly: true, section: "users" },
    ],
  },
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
    <div className="flex h-full w-60 flex-col bg-slate-900">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Building className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {buildingName ?? "ArendaPro"}
          </p>
          <p className="text-[11px] text-slate-400">Панель управления</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {visibleNav.map((section, si) => (
          <div key={si}>
            {section.title && (
              <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
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
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
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

      {/* Logout */}
      <div className="border-t border-slate-800 p-3">
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </form>
      </div>
    </div>
  )
}
