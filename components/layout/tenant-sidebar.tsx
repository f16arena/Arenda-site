"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, CreditCard, FileText,
  ClipboardList, MessageSquare, LogOut, Building, Gauge, User,
} from "lucide-react"
import { cn } from "@/lib/utils"

const nav = [
  {
    items: [
      { href: "/cabinet", label: "Главная", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    title: "МОЙ КАБИНЕТ",
    items: [
      { href: "/cabinet/finances", label: "Финансы", icon: CreditCard },
      { href: "/cabinet/meters", label: "Счётчики", icon: Gauge },
      { href: "/cabinet/documents", label: "Документы", icon: FileText },
    ],
  },
  {
    title: "ПОДДЕРЖКА",
    items: [
      { href: "/cabinet/requests", label: "Заявки", icon: ClipboardList },
      { href: "/cabinet/messages", label: "Сообщения", icon: MessageSquare },
      { href: "/cabinet/profile", label: "Мой профиль", icon: User },
    ],
  },
]

export function TenantSidebar({ companyName }: { companyName?: string }) {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <div className="flex h-full w-60 flex-col bg-slate-900">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600">
          <Building className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {companyName ?? "Личный кабинет"}
          </p>
          <p className="text-[11px] text-slate-400">Арендатор</p>
        </div>
      </div>

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
                        ? "bg-teal-600/20 text-white border-l-2 border-teal-500 pl-[10px]"
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

      <div className="border-t border-slate-800 p-3">
        <form action="/api/logout" method="post">
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
