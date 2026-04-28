import { db } from "@/lib/db"
import { formatMoney } from "@/lib/utils"
import {
  Users, Building2, TrendingUp, AlertTriangle,
  ClipboardList, CheckSquare, ArrowUpRight,
} from "lucide-react"

export default async function AdminDashboard() {
  const [tenants, spaces, charges, requests, tasks] = await Promise.all([
    db.tenant.findMany({ include: { space: true, user: true } }),
    db.space.findMany(),
    db.charge.findMany({ where: { isPaid: false } }),
    db.request.findMany({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }),
    db.task.findMany({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }),
  ])

  const activeTenants = tenants.filter((t) => t.spaceId)
  const totalDebt = charges.reduce((sum, c) => sum + c.amount, 0)
  const occupiedSpaces = spaces.filter((s) => s.status === "OCCUPIED").length
  const vacantSpaces = spaces.filter((s) => s.status === "VACANT").length

  const monthlyRevenue = tenants.reduce((sum, t) => {
    const area = t.space?.area ?? 0
    const rate = t.customRate ?? 0
    return sum + area * rate
  }, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Дашборд</h1>
        <p className="text-sm text-slate-500 mt-0.5">Обзор состояния здания</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Арендаторы"
          value={String(activeTenants.length)}
          sub={`из ${tenants.length} зарегистрированных`}
          icon={Users}
          color="blue"
        />
        <StatCard
          label="Занято помещений"
          value={String(occupiedSpaces)}
          sub={`${vacantSpaces} свободно`}
          icon={Building2}
          color="teal"
        />
        <StatCard
          label="Доход в месяц"
          value={formatMoney(monthlyRevenue)}
          sub="расчётный"
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          label="Общий долг"
          value={formatMoney(totalDebt)}
          sub={`${charges.length} неоплаченных`}
          icon={AlertTriangle}
          color="red"
        />
      </div>

      {/* Quick panels */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-slate-400" />
              Активные заявки
            </h2>
            <a href="/admin/requests" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
              Все <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
          {requests.length === 0 ? (
            <p className="text-sm text-slate-400">Нет активных заявок</p>
          ) : (
            <ul className="space-y-2">
              {requests.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate">{r.title}</span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-slate-400" />
              Задачи
            </h2>
            <a href="/admin/tasks" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
              Все <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-400">Нет активных задач</p>
          ) : (
            <ul className="space-y-2">
              {tasks.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate">{t.title}</span>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Tenants table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Арендаторы</h2>
          <a href="/admin/tenants" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
            Все <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Компания</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Помещение</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Долг</th>
            </tr>
          </thead>
          <tbody>
            {activeTenants.slice(0, 6).map((t) => {
              const debt = charges
                .filter((c) => c.tenantId === t.id)
                .reduce((s, c) => s + c.amount, 0)
              return (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900">{t.companyName}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {t.space ? `Каб. ${t.space.number}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {debt > 0 ? (
                      <span className="text-red-600 font-medium">{formatMoney(debt)}</span>
                    ) : (
                      <span className="text-emerald-600">Нет долга</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string
  value: string
  sub: string
  icon: React.ElementType
  color: "blue" | "teal" | "green" | "red"
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    teal: "bg-teal-50 text-teal-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]} mb-3`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    NEW: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-amber-100 text-amber-700",
    DONE: "bg-emerald-100 text-emerald-700",
  }
  const label: Record<string, string> = {
    NEW: "Новая",
    IN_PROGRESS: "В работе",
    DONE: "Готово",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-slate-100 text-slate-500"}`}>
      {label[status] ?? status}
    </span>
  )
}
