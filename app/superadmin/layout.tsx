import { redirect } from "next/navigation"
import { auth } from "@/auth"
import Link from "next/link"
import { Shield, Building2, Package, BarChart3, LogOut, ArrowLeft, History } from "lucide-react"
import { logout } from "@/app/actions/auth"

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.isPlatformOwner) redirect("/admin")

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="flex h-full w-64 flex-col bg-gradient-to-b from-purple-900 to-slate-900">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-purple-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-600">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">SaaS Platform</p>
            <p className="text-[10px] text-purple-300">Супер-админ</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <SideLink href="/superadmin" icon={BarChart3} label="Обзор" />
          <SideLink href="/superadmin/orgs" icon={Building2} label="Организации" />
          <SideLink href="/superadmin/plans" icon={Package} label="Тарифы" />
          <SideLink href="/superadmin/audit" icon={History} label="Журнал" />

          <div className="border-t border-purple-800 my-3" />

          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-purple-200 hover:bg-purple-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            В свой кабинет
          </Link>
        </nav>

        <div className="border-t border-purple-800 p-3">
          <p className="text-[10px] text-purple-300 mb-2 px-2">{session.user.name}</p>
          <form action={logout}>
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
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div>
            <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded font-semibold">PLATFORM_OWNER</span>
          </div>
          <span className="text-sm font-medium text-slate-700">{session.user.name}</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

function SideLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-purple-200 hover:bg-purple-800 hover:text-white transition-colors"
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  )
}
