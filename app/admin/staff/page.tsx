import { db } from "@/lib/db"
import { formatMoney, ROLES, ROLE_COLORS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { CreateStaffDialog, EditStaffDialog, DeactivateButton, GenerateSalaryButton, MarkSalaryPaidButton } from "./staff-modals"

export default async function StaffPage() {
  const currentPeriod = new Date().toISOString().slice(0, 7)

  const users = await db.user.findMany({
    where: { role: { not: "TENANT" } },
    include: { staff: { include: { salaryPayments: { where: { period: currentPeriod }, orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: { createdAt: "asc" },
  })

  const active = users.filter((u) => u.isActive)
  const inactive = users.filter((u) => !u.isActive)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Сотрудники</h1>
          <p className="text-sm text-slate-500 mt-0.5">{active.length} активных · {inactive.length} уволенных</p>
        </div>
        <div className="flex gap-2">
          <GenerateSalaryButton period={currentPeriod} />
          <CreateStaffDialog />
        </div>
      </div>

      {/* Active staff */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">Активные сотрудники</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Сотрудник</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Роль</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Должность</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Телефон</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Оклад</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Зарплата</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Действия</th>
            </tr>
          </thead>
          <tbody>
            {active.map((u) => {
              const lastPayment = u.staff?.salaryPayments?.[0]
              return (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-slate-600">{u.name[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{u.name}</p>
                        <p className="text-xs text-slate-400">{u.email ?? u.phone ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", ROLE_COLORS[u.role])}>
                      {ROLES[u.role as keyof typeof ROLES] ?? u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{u.staff?.position ?? "—"}</td>
                  <td className="px-5 py-3.5 text-slate-600">{u.phone ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-slate-900">
                    {u.staff ? formatMoney(u.staff.salary) : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    {lastPayment ? (
                      <div className="flex items-center gap-2">
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium",
                          lastPayment.status === "PAID" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {lastPayment.status === "PAID" ? "Выплачено" : "Ожидает"}
                        </span>
                        {lastPayment.status === "PENDING" && (
                          <MarkSalaryPaidButton salaryPaymentId={lastPayment.id} />
                        )}
                      </div>
                    ) : <span className="text-xs text-slate-400">—</span>}
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
                      }} />
                      <DeactivateButton userId={u.id} isActive={u.isActive} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {active.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">Нет активных сотрудников</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dismissed staff */}
      {inactive.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden opacity-70">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-500">Уволенные</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {inactive.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 w-full">
                    <div className="flex items-center gap-3">
                      <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center">
                        <span className="text-xs text-slate-400">{u.name[0]?.toUpperCase()}</span>
                      </div>
                      <span className="text-slate-400 line-through">{u.name}</span>
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", ROLE_COLORS[u.role])}>
                        {ROLES[u.role as keyof typeof ROLES] ?? u.role}
                      </span>
                    </div>
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
