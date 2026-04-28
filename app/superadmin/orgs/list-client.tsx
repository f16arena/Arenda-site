"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Search, LogIn, ExternalLink, AlertTriangle, Pause } from "lucide-react"
import { impersonateOrg } from "@/app/actions/organizations"
import { cn } from "@/lib/utils"

type Item = {
  id: string
  name: string
  slug: string
  isActive: boolean
  isSuspended: boolean
  hasOwner: boolean
  planName: string | null
  planExpiresAt: string | null
  expired: boolean
  expiringSoon: boolean
  daysLeft: number | null
  buildingsCount: number
  usersCount: number
}

type Filter = "all" | "active" | "expiring" | "suspended" | "inactive"

export function OrgsListClient({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((o) => {
      if (q && !o.name.toLowerCase().includes(q) && !o.slug.toLowerCase().includes(q)) return false
      if (filter === "active") return o.isActive && !o.isSuspended && !o.expired
      if (filter === "expiring") return o.isActive && !o.isSuspended && (o.expiringSoon || o.expired)
      if (filter === "suspended") return o.isSuspended
      if (filter === "inactive") return !o.isActive
      return true
    })
  }, [items, query, filter])

  return (
    <div className="space-y-3">
      {/* Поиск + фильтры */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию или slug…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <FilterChip label="Все" active={filter === "all"} onClick={() => setFilter("all")} count={items.length} />
          <FilterChip label="Активные" active={filter === "active"} onClick={() => setFilter("active")} />
          <FilterChip label="Истекают" active={filter === "expiring"} onClick={() => setFilter("expiring")} />
          <FilterChip label="Приостановлено" active={filter === "suspended"} onClick={() => setFilter("suspended")} />
          <FilterChip label="Деактивировано" active={filter === "inactive"} onClick={() => setFilter("inactive")} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <p className="text-sm text-slate-500">Ничего не найдено</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Организация</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Тариф</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Подписка</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Зданий</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Юзеров</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Статус</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <Row key={o.id} o={o} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Row({ o }: { o: Item }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <tr className={cn(
      "border-b border-slate-50 hover:bg-slate-50/50 transition",
      o.isSuspended && "bg-red-50/30",
      !o.isActive && "opacity-60",
    )}>
      <td className="px-5 py-3.5">
        <Link href={`/superadmin/orgs/${o.id}`} className="block">
          <p className="font-medium text-slate-900 hover:text-purple-600 transition">{o.name}</p>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{o.slug}</p>
        </Link>
      </td>
      <td className="px-5 py-3.5 text-slate-600">
        {o.planName ? (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">{o.planName}</span>
        ) : <span className="text-slate-400">—</span>}
      </td>
      <td className="px-5 py-3.5 text-xs">
        {o.planExpiresAt ? (
          <div>
            <p className={cn(
              o.expired ? "text-red-600 font-medium" :
              o.expiringSoon ? "text-amber-600 font-medium" : "text-slate-600"
            )}>
              {new Date(o.planExpiresAt).toLocaleDateString("ru-RU")}
            </p>
            {o.daysLeft !== null && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {o.expired ? `просрочен ${-o.daysLeft} дн.` : `${o.daysLeft} дн.`}
              </p>
            )}
          </div>
        ) : <span className="text-slate-400">—</span>}
      </td>
      <td className="px-5 py-3.5 text-right text-slate-600">{o.buildingsCount}</td>
      <td className="px-5 py-3.5 text-right text-slate-600">{o.usersCount}</td>
      <td className="px-5 py-3.5">
        {o.isSuspended ? (
          <Badge color="red" icon={AlertTriangle}>Приостановлен</Badge>
        ) : !o.isActive ? (
          <Badge color="slate" icon={Pause}>Деактивирован</Badge>
        ) : o.expired ? (
          <Badge color="red">Истёк</Badge>
        ) : o.expiringSoon ? (
          <Badge color="amber">Истекает</Badge>
        ) : (
          <Badge color="emerald">Активен</Badge>
        )}
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-1.5">
          {o.hasOwner && o.isActive && (
            <button
              onClick={() => {
                if (!confirm(`Войти как клиент в «${o.name}»? Действия записываются в журнал.`)) return
                startTransition(async () => {
                  try {
                    await impersonateOrg(o.id)
                    toast.success("Входим как клиент…")
                    router.push("/admin")
                    router.refresh()
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Ошибка")
                  }
                })
              }}
              disabled={pending}
              className="flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 px-2.5 py-1.5 text-[11px] font-medium text-white transition"
              title="Войти как клиент"
            >
              <LogIn className="h-3 w-3" />
              Войти
            </button>
          )}
          <Link
            href={`/superadmin/orgs/${o.id}`}
            className="flex items-center gap-1 rounded-md border border-slate-200 hover:bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition"
          >
            <ExternalLink className="h-3 w-3" />
            Открыть
          </Link>
        </div>
      </td>
    </tr>
  )
}

function FilterChip({ label, active, onClick, count }: {
  label: string
  active: boolean
  onClick: () => void
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-lg text-xs font-medium transition",
        active
          ? "bg-purple-600 text-white shadow-sm"
          : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn("ml-1.5 text-[10px]", active ? "text-purple-100" : "text-slate-400")}>
          {count}
        </span>
      )}
    </button>
  )
}

function Badge({
  color, icon: Icon, children,
}: {
  color: "emerald" | "amber" | "red" | "slate"
  icon?: React.ElementType
  children: React.ReactNode
}) {
  const colors = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    slate: "bg-slate-100 text-slate-600",
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium", colors[color])}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}
