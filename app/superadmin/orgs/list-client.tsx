"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ExternalLink, LogIn, Pause, Search } from "lucide-react"
import { toast } from "sonner"
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
  planExpiresAtLabel: string | null
  expired: boolean
  expiringSoon: boolean
  daysLeft: number | null
  buildingsCount: number
  usersCount: number
}

type Filter = "all" | "active" | "expiring" | "suspended" | "inactive"

export function OrgsListClient({
  items,
  rootHost,
  hideFilters = false,
}: {
  items: Item[]
  rootHost: string
  hideFilters?: boolean
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const filtered = useMemo(() => {
    if (hideFilters) return items
    const q = query.trim().toLowerCase()
    return items.filter((o) => {
      if (q && !o.name.toLowerCase().includes(q) && !o.slug.toLowerCase().includes(q)) return false
      if (filter === "active") return o.isActive && !o.isSuspended && !o.expired
      if (filter === "expiring") return o.isActive && !o.isSuspended && (o.expiringSoon || o.expired)
      if (filter === "suspended") return o.isSuspended
      if (filter === "inactive") return !o.isActive
      return true
    })
  }, [items, query, filter, hideFilters])

  return (
    <div className={hideFilters ? "" : "space-y-3"}>
      {!hideFilters && (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию или slug..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip label="Все" active={filter === "all"} onClick={() => setFilter("all")} count={items.length} />
            <FilterChip label="Активные" active={filter === "active"} onClick={() => setFilter("active")} />
            <FilterChip label="Истекают" active={filter === "expiring"} onClick={() => setFilter("expiring")} />
            <FilterChip label="Приостановлено" active={filter === "suspended"} onClick={() => setFilter("suspended")} />
            <FilterChip label="Деактивировано" active={filter === "inactive"} onClick={() => setFilter("inactive")} />
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Ничего не найдено</p>
        </div>
      ) : (
        <div className={hideFilters ? "overflow-hidden" : "overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <TableHead>Организация</TableHead>
                <TableHead>Тариф</TableHead>
                <TableHead>Подписка</TableHead>
                <TableHead align="right">Зданий</TableHead>
                <TableHead align="right">Пользователей</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead align="right">Действия</TableHead>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <Row key={o.id} o={o} rootHost={rootHost} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Row({ o, rootHost }: { o: Item; rootHost: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const orgUrl = `https://${o.slug}.${rootHost}`

  return (
    <tr
      className={cn(
        "border-b border-slate-50 transition hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50",
        o.isSuspended && "bg-red-50 dark:bg-red-500/10",
        !o.isActive && "opacity-60",
      )}
    >
      <td className="px-5 py-3.5">
        <div className="min-w-0">
          <Link href={`/superadmin/orgs/${o.id}`} className="block">
            <p className="font-medium text-slate-900 transition hover:text-purple-600 dark:text-slate-100 dark:hover:text-purple-400">
              {o.name}
            </p>
          </Link>
          <a
            href={orgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-0.5 font-mono text-[10px] text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
            title="Открыть поддомен в новой вкладке"
          >
            {o.slug}.{rootHost}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </td>
      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
        {o.planName ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {o.planName}
          </span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-xs">
        {o.planExpiresAt ? (
          <div>
            <p
              className={cn(
                o.expired
                  ? "font-medium text-red-600 dark:text-red-400"
                  : o.expiringSoon
                    ? "font-medium text-amber-600 dark:text-amber-400"
                    : "text-slate-600 dark:text-slate-400",
              )}
            >
              {o.planExpiresAtLabel ?? "—"}
            </p>
            {o.daysLeft !== null && (
              <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                {o.expired ? `просрочен ${-o.daysLeft} дн.` : `${o.daysLeft} дн.`}
              </p>
            )}
          </div>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right text-slate-600 dark:text-slate-400">{o.buildingsCount}</td>
      <td className="px-5 py-3.5 text-right text-slate-600 dark:text-slate-400">{o.usersCount}</td>
      <td className="px-5 py-3.5">
        {o.isSuspended ? (
          <Badge color="red" icon={AlertTriangle}>Приостановлен</Badge>
        ) : !o.isActive ? (
          <Badge color="slate" icon={Pause}>Деактивирован</Badge>
        ) : o.expired ? (
          <Badge color="red">Истек</Badge>
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
              type="button"
              onClick={() => {
                if (!confirm(`Войти как клиент в «${o.name}»? Действия записываются в журнал.`)) return
                startTransition(async () => {
                  try {
                    await impersonateOrg(o.id)
                    toast.success("Входим как клиент...")
                    router.push("/admin")
                    router.refresh()
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Ошибка")
                  }
                })
              }}
              disabled={pending}
              className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-blue-700 disabled:bg-slate-300"
              title="Войти как клиент"
            >
              <LogIn className="h-3 w-3" />
              Войти
            </button>
          )}
          <Link
            href={`/superadmin/orgs/${o.id}`}
            className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800/50"
          >
            <ExternalLink className="h-3 w-3" />
            Открыть
          </Link>
        </div>
      </td>
    </tr>
  )
}

function TableHead({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  )
}

function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string
  active: boolean
  onClick: () => void
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-purple-600 text-white shadow-sm"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50",
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn("ml-1.5 text-[10px]", active ? "text-purple-100" : "text-slate-400 dark:text-slate-500")}>
          {count}
        </span>
      )}
    </button>
  )
}

function Badge({
  color,
  icon: Icon,
  children,
}: {
  color: "emerald" | "amber" | "red" | "slate"
  icon?: React.ElementType
  children: React.ReactNode
}) {
  const colors = {
    emerald: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",
    red: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300",
    slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", colors[color])}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}
