"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import {
  LayoutDashboard, CreditCard, FileText,
  ClipboardList, MessageSquare, LogOut, Building, Gauge, User,
  Menu, X, CircleHelp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n/client"
import type { TextKey } from "@/lib/i18n/translate"
import type { Messages } from "@/lib/i18n/messages"

type NavKey = TextKey<Messages>
type NavSection = {
  title?: NavKey
  items: { href: string; label: NavKey; icon: React.ElementType; exact?: boolean }[]
}

// Подписи — ключи словаря (lib/i18n/messages/*/cabinet.ts).
const nav: NavSection[] = [
  {
    items: [
      { href: "/cabinet", label: "cabinet.nav.home", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    title: "cabinet.nav.sectionMine",
    items: [
      { href: "/cabinet/finances", label: "cabinet.nav.finances", icon: CreditCard },
      { href: "/cabinet/meters", label: "cabinet.nav.meters", icon: Gauge },
      { href: "/cabinet/documents", label: "cabinet.nav.documents", icon: FileText },
    ],
  },
  {
    title: "cabinet.nav.sectionSupport",
    items: [
      { href: "/cabinet/requests", label: "cabinet.nav.requests", icon: ClipboardList },
      { href: "/cabinet/messages", label: "cabinet.nav.messages", icon: MessageSquare },
      { href: "/cabinet/profile", label: "cabinet.nav.profile", icon: User },
      { href: "/cabinet/faq", label: "cabinet.nav.faq", icon: CircleHelp },
    ],
  },
]

export function TenantSidebar({ companyName }: { companyName?: string }) {
  const { t } = useT()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setMobileOpen(false), 0)
    return () => window.clearTimeout(id)
  }, [pathname])

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-900 border border-slate-200 dark:bg-slate-900 dark:text-white dark:border-transparent shadow-lg"
        aria-label={t("cabinet.shell.openMenu")}
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className={cn(
        "flex h-full flex-col bg-white border-r border-slate-200 dark:border-transparent dark:bg-slate-900 z-50 transition-transform",
        "lg:relative lg:w-60 lg:translate-x-0",
        "fixed top-0 left-0 w-64 -translate-x-full",
        mobileOpen && "translate-x-0"
      )}>
      <button
        onClick={() => setMobileOpen(false)}
        className="lg:hidden absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label={t("cabinet.shell.closeMenu")}
      >
        <X className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600">
          <Building className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {companyName ?? t("cabinet.shell.cabinetTitle")}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t("cabinet.shell.tenantRole")}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {nav.map((section, si) => (
          <div key={si}>
            {section.title && (
              <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
                {t(section.title)}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive(item.href, item.exact)
                        ? "bg-teal-600/10 text-teal-700 dark:bg-teal-600/20 dark:text-white border-l-2 border-teal-500 pl-[10px]"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {t(item.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <form action="/api/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t("common.actions.logout")}
          </button>
        </form>
      </div>
      </div>
    </>
  )
}
