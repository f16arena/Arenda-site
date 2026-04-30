"use client"

import { useState, useTransition } from "react"
import { Plus, X, Edit2, Power, Key } from "lucide-react"
import { toast } from "sonner"
import {
  createUserAdmin,
  updateUserAdmin,
  toggleUserActive,
  resetUserPassword,
  deleteUserAdmin,
} from "@/app/actions/users"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DeleteAction } from "@/components/ui/delete-action"

const ROLE_OPTIONS = [
  { value: "OWNER", label: "Владелец" },
  { value: "ADMIN", label: "Администратор" },
  { value: "ACCOUNTANT", label: "Бухгалтер" },
  { value: "FACILITY_MANAGER", label: "Завхоз" },
  { value: "TENANT", label: "Арендатор" },
]

export function CreateUserDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [role, setRole] = useState("ADMIN")

  const isStaff = ["ADMIN", "ACCOUNTANT", "FACILITY_MANAGER"].includes(role)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" />
        Добавить пользователя
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="text-base font-semibold">Новый пользователь</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    fd.set("role", role)
                    await createUserAdmin(fd)
                    toast.success("Пользователь создан")
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось создать")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <Field label="Имя *" name="name" required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" name="email" type="email" placeholder="user@example.com" />
                <Field label="Телефон" name="phone" placeholder="+77000000000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Роль *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              {isStaff && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Должность" name="position" placeholder={ROLE_OPTIONS.find((r) => r.value === role)?.label} />
                  <Field label="Оклад, ₸" name="salary" type="number" />
                </div>
              )}
              <Field label="Пароль *" name="password" type="password" required minLength={6} />

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function EditUserDialog({
  user,
}: {
  user: { id: string; name: string; email: string | null; phone: string | null; role: string }
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:text-blue-200"
        aria-label="Редактировать"
        title="Редактировать"
      >
        <Edit2 className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Редактировать пользователя</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await updateUserAdmin(user.id, fd)
                    toast.success("Изменения сохранены")
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <Field label="Имя *" name="name" defaultValue={user.name} required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" name="email" type="email" defaultValue={user.email ?? ""} />
                <Field label="Телефон" name="phone" defaultValue={user.phone ?? ""} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Роль</label>
                <select name="role" defaultValue={user.role} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <Field label="Новый пароль (оставьте пустым чтобы не менять)" name="newPassword" type="password" />

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function ResetPasswordDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [password, setPassword] = useState("")

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:text-amber-200"
        aria-label="Сбросить пароль"
        title="Сбросить пароль"
      >
        <Key className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Сброс пароля</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Установить новый пароль для <span className="font-medium">{userName}</span>:</p>
              <input
                type="text"
                placeholder="Минимум 6 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-mono"
                minLength={6}
              />
              <div className="flex gap-3">
                <button onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button
                  disabled={pending || password.length < 6}
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        await resetUserPassword(userId, password)
                        toast.success("Пароль сброшен")
                        setOpen(false)
                        setPassword("")
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Не удалось")
                      }
                    })
                  }}
                  className="flex-1 rounded-lg bg-amber-600 py-2 text-sm text-white disabled:opacity-60"
                >
                  {pending ? "..." : "Сбросить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function ToggleActiveButton({ userId, isActive, disabled }: { userId: string; isActive: boolean; disabled?: boolean }) {
  const [, startTransition] = useTransition()

  if (disabled) return null

  return (
    <ConfirmDialog
      title={isActive ? "Деактивировать пользователя?" : "Активировать пользователя?"}
      description={isActive ? "Пользователь не сможет войти в систему." : "Пользователь снова сможет войти."}
      variant={isActive ? "danger" : "default"}
      confirmLabel={isActive ? "Деактивировать" : "Активировать"}
      onConfirm={() =>
        new Promise<void>((resolve) => {
          startTransition(async () => {
            try {
              await toggleUserActive(userId, !isActive)
              toast.success(isActive ? "Деактивирован" : "Активирован")
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Ошибка")
            } finally {
              resolve()
            }
          })
        })
      }
      trigger={
        <button
          className={isActive ? "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300" : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:text-emerald-200"}
          aria-label={isActive ? "Деактивировать" : "Активировать"}
          title={isActive ? "Деактивировать" : "Активировать"}
        >
          <Power className="h-4 w-4" />
        </button>
      }
    />
  )
}

export function DeleteUserButton({ userId, userName, disabled }: { userId: string; userName: string; disabled?: boolean }) {
  return (
    <DeleteAction
      action={() => deleteUserAdmin(userId)}
      entity="пользователя"
      description={`Будут удалены связанные данные (арендатор/сотрудник). История (комментарии, задачи) сохранится. Пользователь «${userName}» будет деактивирован.`}
      successMessage="Пользователь удалён"
      disabled={disabled}
    />
  )
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  required,
  minLength,
}: {
  label: string
  name: string
  type?: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
  minLength?: number
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        minLength={minLength}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  )
}
