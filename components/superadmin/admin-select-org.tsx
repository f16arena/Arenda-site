"use client"

import Link from "next/link"
import { useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Building2, Eye, LogIn, Shield, Sparkles } from "lucide-react"
import { impersonateOrg, viewOrgAsPlatformOwner } from "@/app/actions/organizations"
import { cn } from "@/lib/utils"

type Org = {
  id: string
  name: string
  slug: string
  isActive: boolean
  isSuspended: boolean
  planExpiresAt: Date | null
  planName: string | null
  buildingsCount: number
  usersCount: number
  hasOwner: boolean
}

export function AdminSelectOrg({ orgs, userName }: { orgs: Org[]; userName: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Хедер */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Платформенный режим</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">· {userName}</span>
          </div>
          <Link href="/superadmin" className="text-xs font-medium text-purple-600 hover:text-purple-700">
            ← Вернуться в супер-админ
          </Link>
        </div>
      </header>

      {/* Контент */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 mb-4">
            <Sparkles className="h-6 w-6 text-purple-600" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Выберите организацию</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1.5 max-w-md mx-auto">
            Вы вошли как платформенный администратор. Чтобы открыть админку клиента —
            выберите организацию ниже.
          </p>
        </div>

        {orgs.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
            <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Пока нет организаций.</p>
            <Link href="/superadmin/orgs/new" className="inline-block mt-4 rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-sm font-medium text-white">
              Создать первую
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orgs.map((o) => (
              <OrgCard key={o.id} org={o} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function OrgCard({ org }: { org: Org }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const now = new Date()
  const isExpired = !!(org.planExpiresAt && org.planExpiresAt < now)
  const daysLeft = org.planExpiresAt
    ? Math.ceil((org.planExpiresAt.getTime() - now.getTime()) / 86_400_000)
    : null

  const status: { label: string; className: string } = !org.isActive
    ? { label: "Деактивирована", className: "bg-slate-200 text-slate-600 dark:text-slate-400 dark:text-slate-500" }
    : org.isSuspended
    ? { label: "Приостановлена", className: "bg-red-100 text-red-700" }
    : isExpired
    ? { label: "Подписка истекла", className: "bg-red-100 text-red-700" }
    : daysLeft !== null && daysLeft <= 7
    ? { label: `Истекает (${daysLeft} дн.)`, className: "bg-amber-100 text-amber-700" }
    : { label: "Активна", className: "bg-emerald-100 text-emerald-700" }

  return (
    <div className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-purple-300 hover:shadow-lg transition overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{org.name}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-mono mt-0.5">{org.slug}</p>
          </div>
          <span className={cn("shrink-0 text-[10px] font-medium px-2 py-1 rounded-full", status.className)}>
            {status.label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-2">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Тариф</p>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{org.planName ?? "—"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-2">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Зданий</p>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{org.buildingsCount}</p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-2">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Юзеров</p>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{org.usersCount}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!org.hasOwner) {
                toast.error("В организации нет Owner-а")
                return
              }
              if (!confirm(`Войти как клиент в «${org.name}»? Все ваши действия будут залогированы.`)) return
              startTransition(async () => {
                try {
                  await impersonateOrg(org.id)
                  toast.success("Входим как клиент…")
                  router.push("/admin")
                  router.refresh()
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Ошибка")
                }
              })
            }}
            disabled={pending || !org.isActive}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 px-3 py-2 text-xs font-medium text-white transition"
          >
            <LogIn className="h-3.5 w-3.5" />
            Войти как клиент
          </button>
          <button
            onClick={() => {
              startTransition(async () => {
                try {
                  await viewOrgAsPlatformOwner(org.id)
                  router.push("/admin")
                  router.refresh()
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Ошибка")
                }
              })
            }}
            disabled={pending || !org.isActive}
            title="Просмотр от вашего имени (без impersonate)"
            className="rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 disabled:opacity-50 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 transition"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <Link
            href={`/superadmin/orgs/${org.id}`}
            className="rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 transition"
            title="Открыть карточку в супер-админе"
          >
            ⋯
          </Link>
        </div>
      </div>
    </div>
  )
}
