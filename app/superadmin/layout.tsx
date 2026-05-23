import { redirect } from "next/navigation"
import { auth } from "@/auth"
import Link from "next/link"
import type { ElementType, ReactNode } from "react"
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bug,
  Building2,
  Calendar as CalendarIcon,
  Gauge,
  History,
  LogOut,
  Package,
  Shield,
  Sparkles,
  UserCircle,
  UserCog,
} from "lucide-react"
import { ThemeIconToggle } from "@/components/theme-icon-toggle"
import { formatPersonShortName, getDisplayInitial } from "@/lib/display-name"

export default async function SuperadminLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.isPlatformOwner) redirect("/admin")
  const displayUserName = formatPersonShortName(session.user.name)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-800/50">
      <aside className="flex h-full w-64 flex-col bg-gradient-to-b from-purple-900 to-slate-900">
        <div className="flex items-center gap-3 border-b border-purple-800 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-600">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">SaaS Platform</p>
            <p className="text-[10px] text-purple-300">Супер-админ</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <SideLink href="/superadmin" icon={BarChart3} label="Обзор" />
          <SideLink href="/superadmin/orgs" icon={Building2} label="Организации" />
          <SideLink href="/superadmin/users" icon={UserCog} label="Владельцы" />
          <SideLink href="/superadmin/subscriptions" icon={CalendarIcon} label="Подписки" />
          <SideLink href="/superadmin/plans" icon={Package} label="Тарифы" />
          <SideLink href="/superadmin/addons" icon={Package} label="Аддоны" />
          <SideLink href="/superadmin/founders" icon={Sparkles} label="Founders Pricing" />
          <SideLink href="/superadmin/audit" icon={History} label="Журнал" />
          <SideLink href="/superadmin/errors" icon={Bug} label="Ошибки сайта" />
          <SideLink href="/superadmin/performance" icon={Gauge} label="Скорость сайта" />
          <SideLink href="/superadmin/system-health" icon={Activity} label="Проверка системы" />
          <SideLink href="/superadmin/profile" icon={UserCircle} label="Профиль" />

          <div className="my-3 border-t border-purple-800" />

          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-purple-200 hover:bg-purple-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            В свой кабинет
          </Link>
        </nav>

        <div className="border-t border-purple-800 p-3">
          <p className="mb-2 px-2 text-[10px] text-purple-300">{displayUserName}</p>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-purple-200 hover:bg-purple-800 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </form>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
              PLATFORM_OWNER
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeIconToggle />
            <Link
              href="/superadmin/profile"
              className="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Открыть профиль"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-600">
                <span className="text-[11px] font-semibold text-white">
                  {getDisplayInitial(displayUserName)}
                </span>
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{displayUserName}</span>
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

function SideLink({ href, icon: Icon, label }: { href: string; icon: ElementType; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-purple-200 transition-colors hover:bg-purple-800 hover:text-white"
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  )
}
