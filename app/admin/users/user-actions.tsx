"use client"

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react"
import { Edit2, Key, Lock, Plus, Power, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  approveUserRegistration,
  rejectUserRegistration,
} from "@/app/actions/approvals"
import {
  createUserAdmin,
  deleteUserAdmin,
  resetUserPassword,
  toggleUserActive,
  updateUserAdmin,
} from "@/app/actions/users"
import { setUserCapabilityOverride } from "@/app/actions/permissions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DeleteAction } from "@/components/ui/delete-action"
import { isStaffLikeRole, type RoleOption } from "@/lib/role-capabilities"

type BuildingOption = { id: string; name: string }

// Контекст строки пользователя: позволяет кнопкам внутри строки (вкл/выкл,
// удаление) мгновенно менять её вид без перезагрузки всей страницы.
type RowStatus = {
  active: boolean
  setActiveOptimistic: (next: boolean) => void
  removeRow: () => void
}
const RowStatusContext = createContext<RowStatus | null>(null)

/** Клиентская обёртка строки таблицы: хранит оптимистичный статус активности. */
export function UserRow({ initialActive, children }: { initialActive: boolean; children: ReactNode }) {
  const [active, setActive] = useState(initialActive)
  const [removed, setRemoved] = useState(false)
  if (removed) return null
  return (
    <tr className={cn("border-b border-slate-800/70 transition-colors hover:bg-slate-800/50", !active && "opacity-50")}>
      <RowStatusContext.Provider value={{ active, setActiveOptimistic: setActive, removeRow: () => setRemoved(true) }}>
        {children}
      </RowStatusContext.Provider>
    </tr>
  )
}

/** Бейдж «неактивен» в ячейке имени — реагирует на оптимистичный статус строки. */
export function RowInactiveBadge() {
  const row = useContext(RowStatusContext)
  if (!row || row.active) return null
  return (
    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">неактивен</span>
  )
}

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
            <PasswordWithGenerate label="Пароль *" name="password" />

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

export function UserApprovalButtons({ userId, userName }: { userId: string; userName: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            try {
              await approveUserRegistration(userId)
              toast.success(`Пользователь ${userName} подтвержден`)
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Не удалось подтвердить пользователя")
            }
          })
        }}
        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        Подтвердить
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const reason = prompt(`Почему отклоняем заявку ${userName}?`)?.trim()
          if (reason === undefined) return
          const formData = new FormData()
          formData.set("reason", reason || "Отклонено владельцем")
          startTransition(async () => {
            try {
              await rejectUserRegistration(userId, formData)
              toast.success(`Заявка ${userName} отклонена`)
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Не удалось отклонить пользователя")
            }
          })
        }}
        className="rounded-md border border-red-500/40 px-2.5 py-1.5 text-[11px] font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
      >
        Отклонить
      </button>
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

type UserCapabilityInfo = {
  key: string
  label: string
  description: string
  section: string
  level: "view" | "edit" | "sensitive"
  risk: "normal" | "business" | "sensitive"
  requiredFeature: string | null
  requiredFeatureLabel: string | null
  locked: boolean
}

type UserCapabilityGroupInfo = {
  key: string
  label: string
  description: string
  capabilities: string[]
}

type OverrideMode = "INHERIT" | "ALLOW" | "DENY"

type EffectiveCapabilityState = {
  allowed: boolean
  locked: boolean
  source: "owner" | "personal_allow" | "personal_deny" | "role_action" | "role_section" | "fallback" | "locked"
}

type EffectiveRightsSummary = {
  allowed: number
  highRisk: number
  locked: number
  personalAllow: number
  personalDeny: number
}

export function UserCapabilitiesDialog({
  userId,
  userName,
  capabilities,
  capabilityGroups,
  overrides,
  effectiveSummary,
  effectiveStates,
  inheritedStates,
  roleLabel,
}: {
  userId: string
  userName: string
  capabilities: UserCapabilityInfo[]
  capabilityGroups: UserCapabilityGroupInfo[]
  overrides: Record<string, "ALLOW" | "DENY">
  effectiveSummary?: EffectiveRightsSummary
  effectiveStates: Record<string, EffectiveCapabilityState>
  inheritedStates: Record<string, EffectiveCapabilityState>
  roleLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [localOverrides, setLocalOverrides] = useState<Partial<Record<string, "ALLOW" | "DENY">>>(overrides)

  const capabilityMap = useMemo(() => new Map(capabilities.map((capability) => [capability.key, capability])), [capabilities])
  const displayStates = useMemo(() => {
    const states: Record<string, EffectiveCapabilityState> = {}
    for (const capability of capabilities) {
      if (capability.locked) {
        states[capability.key] = { allowed: false, locked: true, source: "locked" }
        continue
      }

      const mode = localOverrides[capability.key]
      if (mode === "ALLOW") {
        states[capability.key] = { allowed: true, locked: false, source: "personal_allow" }
      } else if (mode === "DENY") {
        states[capability.key] = { allowed: false, locked: false, source: "personal_deny" }
      } else {
        states[capability.key] = inheritedStates[capability.key] ?? effectiveStates[capability.key] ?? {
          allowed: false,
          locked: false,
          source: "fallback",
        }
      }
    }
    return states
  }, [capabilities, effectiveStates, inheritedStates, localOverrides])
  const displaySummary = useMemo(() => {
    const summary = {
      allowed: 0,
      highRisk: 0,
      locked: 0,
      personalAllow: 0,
      personalDeny: 0,
    }
    for (const capability of capabilities) {
      const state = displayStates[capability.key]
      const mode = localOverrides[capability.key]
      if (mode === "ALLOW") summary.personalAllow += 1
      if (mode === "DENY") summary.personalDeny += 1
      if (state?.locked) summary.locked += 1
      if (state?.allowed && !state.locked) {
        summary.allowed += 1
        if (capability.risk !== "normal" || capability.level === "sensitive") summary.highRisk += 1
      }
    }
    return summary
  }, [capabilities, displayStates, localOverrides])
  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return capabilityGroups
    return capabilityGroups
      .map((group) => ({
        ...group,
        capabilities: group.capabilities.filter((key) => {
          const capability = capabilityMap.get(key)
          if (!capability) return false
          return [
            capability.key,
            capability.label,
            capability.description,
            capability.requiredFeatureLabel ?? "",
          ].join(" ").toLowerCase().includes(needle)
        }),
      }))
      .filter((group) => group.capabilities.length > 0)
  }, [capabilityGroups, capabilityMap, query])

  function updateOverride(capability: UserCapabilityInfo, mode: OverrideMode) {
    if (capability.locked) {
      toast.info(`Действие закрыто тарифом: ${capability.requiredFeatureLabel ?? capability.requiredFeature}`)
      return
    }

    const before = localOverrides[capability.key]
    setLocalOverrides((current) => {
      const next = { ...current }
      if (mode === "INHERIT") delete next[capability.key]
      else next[capability.key] = mode
      return next
    })

    startTransition(async () => {
      try {
        await setUserCapabilityOverride(userId, capability.key, mode)
        toast.success(mode === "INHERIT" ? "Личное исключение снято" : "Личное исключение сохранено")
      } catch (error) {
        setLocalOverrides((current) => {
          const next = { ...current }
          if (before) next[capability.key] = before
          else delete next[capability.key]
          return next
        })
        toast.error(error instanceof Error ? error.message : "Не удалось сохранить личное право")
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-purple-400 hover:text-purple-200"
        aria-label="Личные права"
        title="Личные права"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <Modal title="Личные права сотрудника" onClose={() => setOpen(false)} wide>
          <div className="space-y-4 p-6">
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-100">
              Эти настройки применяются только к пользователю «{userName}» и имеют приоритет над должностью «{roleLabel}».
            </div>

            {effectiveSummary && (
              <div className="grid gap-2 sm:grid-cols-5">
                <RightsStat label="Итог разрешено" value={displaySummary.allowed} tone="blue" />
                <RightsStat label="Рискованных" value={displaySummary.highRisk} tone={displaySummary.highRisk > 0 ? "amber" : "slate"} />
                <RightsStat label="Лично разрешено" value={displaySummary.personalAllow} tone="emerald" />
                <RightsStat label="Лично запрещено" value={displaySummary.personalDeny} tone="red" />
                <RightsStat label="Закрыто тарифом" value={displaySummary.locked} tone="slate" />
              </div>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск действия..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            </div>

            <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
              {filteredGroups.map((group) => (
                <div key={group.key}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{group.description}</p>
                  <div className="mt-2 space-y-2">
                    {group.capabilities.map((key) => {
                      const capability = capabilityMap.get(key)
                      if (!capability) return null
                      const mode: OverrideMode = localOverrides[capability.key] ?? "INHERIT"
                      const effectiveState = displayStates[capability.key]
                      return (
                        <div
                          key={capability.key}
                          className={`rounded-lg border p-3 ${
                            capability.locked
                              ? "border-slate-800 bg-slate-950/50 opacity-60"
                              : mode === "ALLOW"
                                ? "border-emerald-500/40 bg-emerald-500/10"
                                : mode === "DENY"
                                  ? "border-red-500/40 bg-red-500/10"
                                  : "border-slate-800 bg-slate-950/50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-100">
                                {capability.label}
                                {effectiveState && <EffectiveStatePill state={effectiveState} />}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">{capability.description}</p>
                              {effectiveState && (
                                <p className="mt-2 text-[11px] text-slate-500">
                                  Итог: {effectiveState.allowed && !effectiveState.locked ? "разрешено" : "запрещено"} · {effectiveSourceLabel(effectiveState.source)}
                                </p>
                              )}
                              {capability.locked && (
                                <p className="mt-2 text-[11px] text-amber-300">
                                  Закрыто тарифом: {capability.requiredFeatureLabel ?? capability.requiredFeature}
                                </p>
                              )}
                            </div>
                            {mode !== "INHERIT" && (
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                mode === "ALLOW" ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200"
                              }`}>
                                {mode === "ALLOW" ? "разрешено" : "запрещено"}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <ModeButton active={mode === "INHERIT"} disabled={pending} onClick={() => updateOverride(capability, "INHERIT")}>
                              По должности
                            </ModeButton>
                            <ModeButton active={mode === "ALLOW"} disabled={pending || capability.locked} onClick={() => updateOverride(capability, "ALLOW")} tone="allow">
                              Разрешить
                            </ModeButton>
                            <ModeButton active={mode === "DENY"} disabled={pending || capability.locked} onClick={() => updateOverride(capability, "DENY")} tone="deny">
                              Запретить
                            </ModeButton>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-lg border border-slate-700 py-2 text-sm text-slate-300"
            >
              Закрыть
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

function RightsStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "blue" | "amber" | "emerald" | "red" | "slate"
}) {
  const tones = {
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    red: "border-red-500/30 bg-red-500/10 text-red-200",
    slate: "border-slate-800 bg-slate-950/50 text-slate-300",
  }

  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-lg font-semibold">{value}</p>
      <p className="mt-1 text-[10px] opacity-75">{label}</p>
    </div>
  )
}

function EffectiveStatePill({ state }: { state: EffectiveCapabilityState }) {
  const allowed = state.allowed && !state.locked
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
      state.locked
        ? "border-slate-700 text-slate-500"
        : allowed
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-500/30 bg-red-500/10 text-red-200"
    }`}>
      {state.locked ? <Lock className="h-3 w-3" /> : allowed ? <ShieldCheck className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {state.locked ? "тариф" : allowed ? "разрешено" : "запрещено"}
    </span>
  )
}

function effectiveSourceLabel(source: EffectiveCapabilityState["source"]) {
  const labels: Record<EffectiveCapabilityState["source"], string> = {
    owner: "владелец имеет полный доступ",
    personal_allow: "личное разрешение",
    personal_deny: "личный запрет",
    role_action: "точное право должности",
    role_section: "доступ к разделу",
    fallback: "базовые права роли",
    locked: "закрыто тарифом",
  }
  return labels[source]
}

export function ResetPasswordDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [password, setPassword] = useState("")
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  function close() {
    setOpen(false)
    setPassword("")
    setDone(false)
    setCopied(false)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Не удалось скопировать")
    }
  }

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
        <Modal title="Сброс пароля" onClose={close} narrow>
          <div className="space-y-4 p-6">
            {!done ? (
              <>
                <p className="text-sm text-slate-400">
                  Новый пароль для <span className="font-medium text-slate-200">{userName}</span>. Можно сгенерировать
                  и передать пользователю — при первом входе он будет обязан сменить его.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Минимум 6 символов"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setPassword(genPassword())}
                    className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Сгенерировать
                  </button>
                </div>
                <div className="flex gap-3">
                  <button onClick={close} className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-300">Отмена</button>
                  <button
                    disabled={pending || password.length < 6}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          await resetUserPassword(userId, password)
                          toast.success("Пароль обновлён")
                          setDone(true)
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
              </>
            ) : (
              <>
                <p className="text-sm text-slate-400">
                  Пароль обновлён. Передайте его пользователю — при первом входе система попросит сменить пароль.
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-sm text-slate-100">{password}</code>
                  <button
                    type="button"
                    onClick={copy}
                    className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    {copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                <button onClick={close} className="w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-900 hover:bg-white">
                  Готово
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

export function ToggleActiveButton({ userId, isActive, disabled }: { userId: string; isActive: boolean; disabled?: boolean }) {
  const [, startTransition] = useTransition()
  // Статус строки берём из контекста — тогда вся строка (затемнение, бейдж)
  // меняется мгновенно без перезагрузки страницы. Откатываем при ошибке.
  const row = useContext(RowStatusContext)
  const active = row ? row.active : isActive
  const setActive = (next: boolean) => row?.setActiveOptimistic(next)
  if (disabled) return null

  return (
    <ConfirmDialog
      title={active ? "Деактивировать пользователя?" : "Активировать пользователя?"}
      description={active ? "Пользователь не сможет войти в систему." : "Пользователь снова сможет войти."}
      variant={active ? "danger" : "default"}
      confirmLabel={active ? "Деактивировать" : "Активировать"}
      onConfirm={() =>
        new Promise<void>((resolve) => {
          const next = !active
          setActive(next) // оптимистично
          startTransition(async () => {
            try {
              await toggleUserActive(userId, next)
              toast.success(next ? "Активирован" : "Деактивирован")
            } catch (error) {
              setActive(!next) // откат при ошибке
              toast.error(error instanceof Error ? error.message : "Ошибка")
            } finally {
              resolve()
            }
          })
        })
      }
      trigger={
        <button
          className={active ? "text-slate-500 hover:text-slate-300" : "text-emerald-400 hover:text-emerald-200"}
          aria-label={active ? "Деактивировать" : "Активировать"}
          title={active ? "Активен — нажмите, чтобы деактивировать" : "Неактивен — нажмите, чтобы активировать"}
        >
          <Power className="h-4 w-4" />
        </button>
      }
    />
  )
}

export function DeleteUserButton({ userId, userName, disabled }: { userId: string; userName: string; disabled?: boolean }) {
  const row = useContext(RowStatusContext)
  return (
    <DeleteAction
      action={() => deleteUserAdmin(userId)}
      entity="пользователя"
      description={`Связанные профильные данные будут обработаны безопасно. Пользователь «${userName}» будет деактивирован.`}
      successMessage="Пользователь удалён"
      disabled={disabled}
      onSuccess={() => row?.removeRow()}
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

// Генератор временного пароля без неоднозначных символов (0/O/1/l/I).
function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let p = ""
  for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p
}

function PasswordWithGenerate({ label, name }: { label: string; name: string }) {
  const [value, setValue] = useState("")
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">{label}</label>
      <div className="flex gap-2">
        <input
          name={name}
          type="text"
          required
          minLength={6}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Минимум 6 символов"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => setValue(genPassword())}
          className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
        >
          Сгенерировать
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Выдайте этот пароль пользователю. При первом входе он будет обязан сменить его.
      </p>
    </div>
  )
}

function ModeButton({
  active,
  disabled,
  onClick,
  tone = "neutral",
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  tone?: "neutral" | "allow" | "deny"
  children: React.ReactNode
}) {
  const activeClass = tone === "allow"
    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100"
    : tone === "deny"
      ? "border-red-500/50 bg-red-500/15 text-red-100"
      : "border-blue-500/50 bg-blue-500/15 text-blue-100"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? activeClass : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  )
}

function Modal({
  title,
  children,
  onClose,
  narrow = false,
  wide = false,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  narrow?: boolean
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-slate-900 shadow-2xl ${wide ? "max-w-3xl" : narrow ? "max-w-sm" : "max-w-md"}`}>
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
