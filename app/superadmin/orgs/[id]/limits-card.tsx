import { Building2, Users, Briefcase, TrendingUp } from "lucide-react"

export function LimitsCard({
  buildings,
  tenants,
  users,
  leads,
  maxBuildings,
  maxTenants,
  maxUsers,
  maxLeads,
}: {
  buildings: number
  tenants: number
  users: number
  leads: number
  maxBuildings: number | null
  maxTenants: number | null
  maxUsers: number | null
  maxLeads: number | null
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Использование тарифа</p>
      <Row label="Зданий" current={buildings} max={maxBuildings} icon={Building2} />
      <Row label="Арендаторов" current={tenants} max={maxTenants} icon={Briefcase} />
      <Row label="Пользователей" current={users} max={maxUsers} icon={Users} />
      <Row label="Лидов" current={leads} max={maxLeads} icon={TrendingUp} />
    </div>
  )
}

function Row({
  label,
  current,
  max,
  icon: Icon,
}: {
  label: string
  current: number
  max: number | null
  icon: React.ElementType
}) {
  const isUnlimited = max === null
  const percent = isUnlimited ? 0 : Math.min(100, Math.round((current / Math.max(max, 1)) * 100))
  const barColor =
    percent >= 100 ? "bg-red-500" :
    percent >= 80 ? "bg-amber-500" :
    "bg-emerald-500"

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-sm">
        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
          <Icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          {label}
        </div>
        <div className="text-xs font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">
          <span className="font-semibold text-slate-900 dark:text-slate-100">{current}</span>
          <span className="text-slate-400 dark:text-slate-500"> / {isUnlimited ? "∞" : max}</span>
          {!isUnlimited && <span className="ml-1.5 text-slate-400 dark:text-slate-500">({percent}%)</span>}
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        {isUnlimited ? (
          <div className="h-full bg-slate-300 w-1/12" />
        ) : (
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.max(percent, 2)}%` }} />
        )}
      </div>
    </div>
  )
}
