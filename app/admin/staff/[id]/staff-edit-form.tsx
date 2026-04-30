"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updateStaff, deactivateStaff, reactivateStaff } from "@/app/actions/staff"

const ROLES = [
  { value: "OWNER", label: "Владелец" },
  { value: "ADMIN", label: "Администратор" },
  { value: "ACCOUNTANT", label: "Бухгалтер" },
  { value: "FACILITY_MANAGER", label: "Завхоз" },
  { value: "EMPLOYEE", label: "Сотрудник" },
]

export function StaffEditForm({
  userId, staffId, initial, isCurrentUser,
}: {
  userId: string
  staffId: string | null
  initial: {
    name: string
    phone: string | null
    email: string | null
    role: string
    position: string
    salary: number
    isActive: boolean
  }
  isCurrentUser: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          if (!staffId) {
            toast.error("Сначала добавьте Staff-запись (через диалог создания)")
            return
          }
          try {
            await updateStaff(staffId, userId, fd)
            toast.success("Сохранено")
            router.refresh()
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Ошибка")
          }
        })
      }
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">ФИО *</label>
          <input
            name="name"
            defaultValue={initial.name}
            required
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Телефон</label>
          <input
            name="phone"
            defaultValue={initial.phone ?? ""}
            placeholder="+7..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Email</label>
          <input
            type="email"
            name="email"
            defaultValue={initial.email ?? ""}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Роль</label>
          <select
            name="role"
            defaultValue={initial.role}
            disabled={isCurrentUser}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900 disabled:bg-slate-50 dark:bg-slate-800/50 disabled:text-slate-500 dark:text-slate-400 dark:text-slate-500"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {isCurrentUser && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Свою роль изменить нельзя
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Должность</label>
          <input
            name="position"
            defaultValue={initial.position}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Оклад, ₸</label>
          <input
            name="salary"
            type="number"
            defaultValue={initial.salary}
            min={0}
            step={1000}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">
            Новый пароль (оставьте пустым, чтобы не менять)
          </label>
          <input
            type="password"
            name="newPassword"
            placeholder="••••••••"
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          disabled={isCurrentUser}
          onClick={() =>
            startTransition(async () => {
              try {
                if (initial.isActive) {
                  await deactivateStaff(userId)
                  toast.success("Сотрудник уволен")
                } else {
                  await reactivateStaff(userId)
                  toast.success("Сотрудник восстановлен")
                }
                router.refresh()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка")
              }
            })
          }
          className={`text-xs font-medium ${
            initial.isActive ? "text-red-600 hover:text-red-700" : "text-emerald-600 hover:text-emerald-700"
          } disabled:text-slate-400 dark:text-slate-500`}
          title={isCurrentUser ? "Себя уволить нельзя" : ""}
        >
          {initial.isActive ? "Уволить" : "Восстановить"}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </form>
  )
}
