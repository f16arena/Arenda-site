export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requireOwner } from "@/lib/permissions"
import { ROLES, ROLE_COLORS, formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { Shield, Users as UsersIcon } from "lucide-react"
import { CreateUserDialog, EditUserDialog, ToggleActiveButton, ResetPasswordDialog, DeleteUserButton } from "./user-actions"

export default async function UsersPage() {
  const session = await requireOwner()

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      tenant: { select: { id: true, companyName: true } },
      staff: { select: { id: true, position: true, salary: true } },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  })

  const byRole = users.reduce<Record<string, number>>((acc, u) => {
    if (u.isActive) acc[u.role] = (acc[u.role] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <Shield className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Управление пользователями</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Все аккаунты системы · доступно только владельцу
            </p>
          </div>
        </div>
        <CreateUserDialog />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { role: "OWNER", label: "Владельцы" },
          { role: "ADMIN", label: "Админы" },
          { role: "ACCOUNTANT", label: "Бухгалтеры" },
          { role: "FACILITY_MANAGER", label: "Завхозы" },
          { role: "TENANT", label: "Арендаторы" },
        ].map((r) => (
          <div key={r.role} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-2xl font-bold text-slate-900">{byRole[r.role] ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">{r.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Пользователь</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Роль</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Контакты</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Профиль</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Создан</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === session.id
              return (
                <tr
                  key={u.id}
                  className={cn(
                    "border-b border-slate-50 hover:bg-slate-50 transition-colors",
                    !u.isActive && "opacity-50"
                  )}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-slate-600">{u.name[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 flex items-center gap-2">
                          {u.name}
                          {isSelf && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">ВЫ</span>
                          )}
                          {!u.isActive && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">НЕАКТИВЕН</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">{u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", ROLE_COLORS[u.role] ?? "bg-slate-100 text-slate-500")}>
                      {ROLES[u.role as keyof typeof ROLES] ?? u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    <div className="space-y-0.5">
                      {u.email && <p className="text-xs">{u.email}</p>}
                      {u.phone && <p className="text-xs font-mono">{u.phone}</p>}
                      {!u.email && !u.phone && <span className="text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {u.tenant ? (
                      <span className="text-xs">Арендатор: {u.tenant.companyName}</span>
                    ) : u.staff ? (
                      <span className="text-xs">{u.staff.position}</span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 text-xs">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <EditUserDialog
                        user={{
                          id: u.id,
                          name: u.name,
                          email: u.email,
                          phone: u.phone,
                          role: u.role,
                        }}
                      />
                      <ResetPasswordDialog userId={u.id} userName={u.name} />
                      <ToggleActiveButton userId={u.id} isActive={u.isActive} disabled={isSelf} />
                      <DeleteUserButton userId={u.id} userName={u.name} disabled={isSelf} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <UsersIcon className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Нет пользователей</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
