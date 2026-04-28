"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Users, Building2, Wallet, Gauge,
  FileText, ClipboardList, CheckSquare, UserCog,
  MessageSquare, AlertCircle, Phone, BarChart3,
  LogOut, ChevronDown, ChevronRight, Building, Settings, Shield,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { logout } from "@/app/actions/auth"

const nav = [
  {
    items: [
      { href: "/admin", label: "Дашборд", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    title: "АРЕНДА",
    items: [
      { href: "/admin/tenants", label: "Арендаторы", icon: Users },
      { href: "/admin/spaces", label: "Помещения", icon: Building2 },
    ],
  },
  {
    title: "ФИНАНСЫ",
    items: [
      { href: "/admin/finances", label: "Финансы", icon: Wallet },
      { href: "/admin/meters", label: "Счётчики", icon: Gauge },
    ],
  },
  {
    title: "ДОКУМЕНТЫ",
    items: [
      { href: "/admin/documents", label: "Документы", icon: FileText },
      { href: "/admin/documents/templates/reconciliation", label: "Акт сверки", icon: BarChart3 },
    ],
  },
  {
    title: "ОБСЛУЖИВАНИЕ",
    items: [
      { href: "/admin/requests", label: "Заявки", icon: ClipboardList },
      { href: "/admin/tasks", label: "Задачи", icon: CheckSquare },
    ],
  },
  {
    title: "ПЕРСОНАЛ",
    items: [
      { href: "/admin/staff", label: "Сотрудники", icon: UserCog },
    ],
  },
  {
    title: "ПРОЧЕЕ",
    items: [
      { href: "/admin/messages", label: "Сообщения", icon: MessageSquare },
      { href: "/admin/complaints", label: "Жалобы", icon: AlertCircle },
      { href: "/admin/emergency", label: "Экстренные", icon: Phone },
      { href: "/admin/analytics", label: "Аналитика", icon: BarChart3 },
      { href: "/admin/settings", label: "Настройки", icon: Settings },
      { href: "/admin/roles", label: "Роли и доступ", icon: Shield },
    ],
  },
]

export function AdminSidebar({ buildingName }: { buildingName?: string }) {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

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
        {nav.map((section, si) => (
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
