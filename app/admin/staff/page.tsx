export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import Link from "next/link"
import { formatMoney, ROLES, ROLE_COLORS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { CreateStaffDialog, EditStaffDialog, DeactivateButton, GenerateSalaryButton, MarkSalaryPaidButton } from "./staff-modals"
import { requireOrgAccess } from "@/lib/org"
import { PageHeader } from "@/components/ui/page"
import { UsersRound } from "lucide-react"

export default async function StaffPage() {
  const { orgId } = await requireOrgAccess()
  const currentPeriod = new Date().toISOString().slice(0, 7)

  const users = await db.user.findMany({
    where: { role: { not: "TENANT" }, organizationId: orgId, deletedAt: null },
    include: {
      staff: { include: { salaryPayments: { where: { period: currentPeriod }, orderBy: { createdAt: "desc" }, take: 1 } } },
      buildingAccess: {
        select: { buildingId: true, building: { select: { name: true } } },
        orderBy: { building: { createdAt: "asc" } },
      },
    },
    orderBy: { createdAt: "asc" },
  })
  const buildings = await db.building.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  })

  const active = users.filter((u) => u.isActive)
  const inactive = users.filter((u) => !u.isActive)

  return (
    <div className="space-y-5">
      <PageHeader
        icon={UsersRound}
        title="Сотрудники"
        subtitle={`${active.length} активных · ${inactive.length} уволенных`}
        actions={
          <>
            <GenerateSalaryButton period={currentPeriod} />
            <CreateStaffDialog buildings={buildings} />
          </>
        }
      />

      {/* Active staff — карточки на мобиле */}
      <div className="space-y-2.5 sm:hidden">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Активные сотрудники</p>
        {active.map((u) => {
          const lastPayment = u.staff?.salaryPayments?.[0]
          return (
            <div key={u.id} className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/admin/staff/${u.id}`} className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{u.name[0]?.toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">{u.name}</p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">{u.email ?? u.phone ?? "—"}</p>
                  </div>
                </Link>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", ROLE_COLORS[u.role])}>{ROLES[u.role as keyof typeof ROLES] ?? u.role}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                {u.staff?.position && <span>{u.staff.position}</span>}
                {u.phone && <span className="font-mono">{u.phone}</span>}
                {u.staff && <span className="font-medium text-slate-700 dark:text-slate-300">{formatMoney(u.staff.salary)}</span>}
                <span>{u.role === "OWNER" ? "Все здания" : u.buildingAccess.length > 0 ? u.buildingAccess.map((a) => a.building.name).join(", ") : "Здания не назначены"}</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                {lastPayment ? (
                  <span className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", lastPayment.status === "PAID" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300")}>
                      {lastPayment.status === "PAID" ? "Выплачено" : "Ожидает"}
                    </span>
                    {lastPayment.status === "PENDING" && <MarkSalaryPaidButton salaryPaymentId={lastPayment.id} />}
                  </span>
                ) : <span className="text-xs text-slate-400 dark:text-slate-500">Зарплата не начислена</span>}
                <div className="flex items-center gap-3">
                  <EditStaffDialog user={{
                    id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, isActive: u.isActive,
                    staff: u.staff ? { id: u.staff.id, position: u.staff.position, salary: u.staff.salary } : null,
                    buildingIds: u.buildingAccess.map((a) => a.buildingId),
                  }} buildings={buildings} />
                  <DeactivateButton userId={u.id} isActive={u.isActive} />
                </div>
              </div>
            </div>
          )
        })}
        {active.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">Нет активных сотрудников</p>}
      </div>

      {/* Active staff — таблица (sm+) */}
      <div className="hidden bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto sm:block">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Активные сотрудники</p>
        </div>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Сотрудник</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Роль</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Должность</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Здания</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Телефон</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Оклад</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Зарплата</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Действия</th>
            </tr>
          </thead>
          <tbody>
            {active.map((u) => {
              const lastPayment = u.staff?.salaryPayments?.[0]
              return (
                <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/staff/${u.id}`} className="flex items-center gap-3 group">
                      <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20 transition">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">{u.name[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{u.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{u.email ?? u.phone ?? "—"}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", ROLE_COLORS[u.role])}>
                      {ROLES[u.role as keyof typeof ROLES] ?? u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{u.staff?.position ?? "—"}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                    {u.role === "OWNER" ? (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">Все здания</span>
                    ) : u.buildingAccess.length > 0 ? (
                      <span className="text-xs">{u.buildingAccess.map((a) => a.building.name).join(", ")}</span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">Не назначено</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{u.phone ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-slate-900 dark:text-slate-100">
                    {u.staff ? formatMoney(u.staff.salary) : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    {lastPayment ? (
                      <div className="flex items-center gap-2">
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium",
                          lastPayment.status === "PAID" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300"
                        )}>
                          {lastPayment.status === "PAID" ? "Выплачено" : "Ожидает"}
                        </span>
                        {lastPayment.status === "PENDING" && (
                          <MarkSalaryPaidButton salaryPaymentId={lastPayment.id} />
                        )}
                      </div>
                    ) : <span className="text-xs text-slate-400 dark:text-slate-500">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 justify-end">
                      <EditStaffDialog user={{
                        id: u.id,
                        name: u.name,
                        phone: u.phone,
                        email: u.email,
                        role: u.role,
                        isActive: u.isActive,
                        staff: u.staff ? { id: u.staff.id, position: u.staff.position, salary: u.staff.salary } : null,
                        buildingIds: u.buildingAccess.map((a) => a.buildingId),
                      }} buildings={buildings} />
                      <DeactivateButton userId={u.id} isActive={u.isActive} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {active.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Нет активных сотрудников</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dismissed staff */}
      {inactive.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto opacity-70">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Уволенные</p>
          </div>
          <table className="w-full min-w-[640px] text-sm">
            <tbody>
              {inactive.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3 w-full">
                    <Link href={`/admin/staff/${u.id}`} className="flex items-center gap-3 group">
                      <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <span className="text-xs text-slate-400 dark:text-slate-500">{u.name[0]?.toUpperCase()}</span>
                      </div>
                      <span className="text-slate-400 dark:text-slate-500 line-through group-hover:text-slate-600 dark:group-hover:text-slate-300">{u.name}</span>
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", ROLE_COLORS[u.role])}>
                        {ROLES[u.role as keyof typeof ROLES] ?? u.role}
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <DeactivateButton userId={u.id} isActive={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
