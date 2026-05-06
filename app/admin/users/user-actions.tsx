"use client"

import { useState, useTransition } from "react"
import { Edit2, Key, Plus, Power, X } from "lucide-react"
import { toast } from "sonner"
import {
  createUserAdmin,
  deleteUserAdmin,
  resetUserPassword,
  toggleUserActive,
  updateUserAdmin,
} from "@/app/actions/users"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DeleteAction } from "@/components/ui/delete-action"
import { isStaffLikeRole, type RoleOption } from "@/lib/role-capabilities"

type BuildingOption = { id: string; name: string }

export function CreateUserDialog({
  buildings,
  roleOptions,
}: {
  buildings: BuildingOption[]
  roleOptions: RoleOption[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const defaultRole = roleOptions.find((role) => role.value === "ADMIN")?.value ?? roleOptions[0]?.value ?? "ADMIN"
  const [role, setRole] = useState(defaultRole)

  const isStaff = isStaffLikeRole(role)
  const roleLabel = roleOptions.find((item) => item.value === role)?.label ?? role

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        <Plus className="h-4 w-4" />
        Добавить пользователя
      </button>

      {open && (
        <Modal title="Новый пользователь" onClose={() => setOpen(false)}>
          <form
            action={(fd) =>
              startTransition(async () => {
                try {
                  fd.set("role", role)
                  await createUserAdmin(fd)
                  toast.success("Пользователь создан")
                  setOpen(false)
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Не удалось создать пользователя")
                }
              })
            }
            className="space-y-4 p-6"
          >
            <Field label="Имя *" name="name" required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" name="email" type="email" placeholder="user@example.com" />
              <Field label="Телефон" name="phone" type="tel" placeholder="+7 700 000 00 00" />
            </div>
            <RoleSelect role={role} setRole={setRole} roleOptions={roleOptions} />
            {isStaff && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Должность" name="position" placeholder={roleLabel} />
                <Field label="Оклад, ₸" name="salary" type="number" />
              </div>
            )}
            {isStaff && <BuildingAccessField buildings={buildings} />}
            <Field label="Пароль *" name="password" type="password" required minLength={6} />

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-300">
                Отмена
              </button>
              <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white disabled:opacity-60">
                {pending ? "Создание..." : "Создать"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

export function EditUserDialog({
  user,
  buildings,
  roleOptions,
}: {
  user: { id: string; name: string; email: string | null; phone: string | null; role: string; buildingIds: string[] }
  buildings: BuildingOption[]
  roleOptions: RoleOption[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [role, setRole] = useState(user.role)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-blue-400 hover:text-blue-200"
        aria-label="Редактировать"
        title="Редактировать"
      >
        <Edit2 className="h-4 w-4" />
      </button>

      {open && (
        <Modal title="Редактировать пользователя" onClose={() => setOpen(false)}>
          <form
            action={(fd) =>
              startTransition(async () => {
                try {
                  fd.set("role", role)
                  await updateUserAdmin(user.id, fd)
                  toast.success("Изменения сохранены")
                  setOpen(false)
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Не удалось сохранить")
                }
              })
            }
            className="space-y-4 p-6"
          >
            <Field label="Имя *" name="name" defaultValue={user.name} required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" name="email" type="email" defaultValue={user.email ?? ""} />
              <Field label="Телефон" name="phone" type="tel" defaultValue={user.phone ?? ""} />
            </div>
            <RoleSelect role={role} setRole={setRole} roleOptions={roleOptions} />
            {isStaffLikeRole(role) && (
              <BuildingAccessField buildings={buildings} selectedIds={user.buildingIds} />
            )}
            <Field label="Новый пароль" name="newPassword" type="password" placeholder="Оставьте пустым, если не меняете" />

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-300">
                Отмена
              </button>
              <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white disabled:opacity-60">
                {pending ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </form>
        </Modal>
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
        className="text-amber-400 hover:text-amber-200"
        aria-label="Сбросить пароль"
        title="Сбросить пароль"
      >
        <Key className="h-4 w-4" />
      </button>

      {open && (
        <Modal title="Сброс пароля" onClose={() => setOpen(false)} narrow>
          <div className="space-y-4 p-6">
            <p className="text-sm text-slate-400">
              Установить новый пароль для <span className="font-medium text-slate-200">{userName}</span>:
            </p>
            <input
              type="text"
              placeholder="Минимум 6 символов"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              minLength={6}
            />
            <div className="flex gap-3">
              <button onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-300">Отмена</button>
              <button
                disabled={pending || password.length < 6}
                onClick={() => {
                  startTransition(async () => {
                    try {
                      await resetUserPassword(userId, password)
                      toast.success("Пароль сброшен")
                      setOpen(false)
                      setPassword("")
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Не удалось сбросить пароль")
                    }
                  })
                }}
                className="flex-1 rounded-lg bg-amber-600 py-2 text-sm text-white disabled:opacity-60"
              >
                {pending ? "..." : "Сбросить"}
              </button>
            </div>
          </div>
        </Modal>
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
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Ошибка")
            } finally {
              resolve()
            }
          })
        })
      }
      trigger={
        <button
          className={isActive ? "text-slate-500 hover:text-slate-300" : "text-emerald-400 hover:text-emerald-200"}
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
      description={`Связанные профильные данные будут обработаны безопасно. Пользователь «${userName}» будет деактивирован.`}
      successMessage="Пользователь удален"
      disabled={disabled}
    />
  )
}

function RoleSelect({
  role,
  setRole,
  roleOptions,
}: {
  role: string
  setRole: (role: string) => void
  roleOptions: RoleOption[]
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">Должность *</label>
      <select
        value={role}
        onChange={(event) => setRole(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
      >
        {roleOptions.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
    </div>
  )
}

function BuildingAccessField({
  buildings,
  selectedIds = [],
}: {
  buildings: BuildingOption[]
  selectedIds?: string[]
}) {
  const selected = new Set(selectedIds)

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">Здания *</label>
      {buildings.length === 0 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Сначала создайте здание, затем назначьте сотрудника.
        </p>
      ) : (
        <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-slate-700 p-2">
          {buildings.map((building) => (
            <label key={building.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-800/50">
              <input
                type="checkbox"
                name="buildingIds"
                value={building.id}
                defaultChecked={selected.size > 0 ? selected.has(building.id) : buildings.length === 1}
                className="rounded border-slate-600"
              />
              <span className="text-slate-300">{building.name}</span>
            </label>
          ))}
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-500">
        Владелец видит все здания, сотрудники видят только назначенные.
      </p>
    </div>
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
      <label className="mb-1.5 block text-xs font-medium text-slate-500">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        minLength={minLength}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
      />
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
  narrow = false,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  narrow?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-slate-900 shadow-2xl ${narrow ? "max-w-sm" : "max-w-md"}`}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} aria-label="Закрыть">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
