"use client"
import { FIELD_CLS } from "@/lib/ui-fields"
import { ModalShell } from "@/components/ui/modal"
import { askText } from "@/components/ui/dialog-host"

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
import { KzPhoneInput, AsciiEmailInput } from "@/components/forms/contact-inputs"
import { useT } from "@/lib/i18n/client"

type BuildingOption = { id: string; name: string }

// Системные роли: подписи из словаря, свои должности организации — как их
// назвал владелец (перевод им не нужен).
const SYSTEM_ROLE_KEYS = ["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE", "TENANT"] as const
type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number]
function isSystemRoleKey(role: string): role is SystemRoleKey {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(role)
}

/** Подпись должности для выпадающего списка и подсказок. */
function useRoleLabel() {
  const { t } = useT()
  return (option: RoleOption) =>
    isSystemRoleKey(option.value)
      ? t(`adminSettings.roles.systemRoles.${option.value}`)
      : option.label
}

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
  const { t } = useT()
  const row = useContext(RowStatusContext)
  if (!row || row.active) return null
  return (
    <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{t("adminSettings.users.inactive")}</span>
  )
}

export function CreateUserDialog({
  buildings,
  roleOptions,
}: {
  buildings: BuildingOption[]
  roleOptions: RoleOption[]
}) {
  const { t } = useT()
  const labelOf = useRoleLabel()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const defaultRole = roleOptions.find((role) => role.value === "ADMIN")?.value ?? roleOptions[0]?.value ?? "ADMIN"
  const [role, setRole] = useState(defaultRole)

  const isStaff = isStaffLikeRole(role)
  const selectedOption = roleOptions.find((item) => item.value === role)
  const roleLabel = selectedOption ? labelOf(selectedOption) : role

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        <Plus className="h-4 w-4" />
        {t("adminSettings.users.dialog.add")}
      </button>

      {open && (
        <Modal title={t("adminSettings.users.dialog.newTitle")} onClose={() => setOpen(false)}>
          <form
            action={(fd) =>
              startTransition(async () => {
                try {
                  fd.set("role", role)
                  await createUserAdmin(fd)
                  toast.success(t("adminSettings.users.dialog.created"))
                  setOpen(false)
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t("adminSettings.users.dialog.createError"))
                }
              })
            }
            className="space-y-4 p-6"
          >
            <Field label={`${t("adminSettings.users.dialog.name")} *`} name="name" required />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adminSettings.users.dialog.email")} name="email" type="email" placeholder="user@example.com" />
              <Field label={t("adminSettings.users.dialog.phone")} name="phone" type="tel" placeholder="+7 700 000 00 00" />
            </div>
            <RoleSelect role={role} setRole={setRole} roleOptions={roleOptions} />
            {isStaff && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("adminSettings.users.dialog.position")} name="position" placeholder={roleLabel} />
                <Field label={t("adminSettings.users.dialog.salary")} name="salary" type="number" />
              </div>
            )}
            {isStaff && <BuildingAccessField buildings={buildings} />}
            <PasswordWithGenerate label={`${t("adminSettings.users.dialog.password")} *`} name="password" />

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-sm text-slate-700 dark:text-slate-300">
                {t("common.actions.cancel")}
              </button>
              <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white disabled:opacity-60">
                {pending ? t("adminSettings.users.dialog.creating") : t("adminSettings.users.dialog.create")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

export function UserApprovalButtons({ userId, userName }: { userId: string; userName: string }) {
  const { t } = useT()
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
              toast.success(t("adminSettings.users.approval.approved", { name: userName }))
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("adminSettings.users.approval.approveError"))
            }
          })
        }}
        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {t("adminSettings.users.approval.approve")}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const reason = (await askText({
            title: t("adminSettings.users.approval.rejectTitle", { name: userName }),
            label: t("adminSettings.users.approval.rejectReason"),
            optional: true,
            confirmLabel: t("adminSettings.users.approval.reject"),
          }))?.trim()
          if (reason === undefined) return
          const formData = new FormData()
          formData.set("reason", reason || t("adminSettings.users.approval.rejectDefault"))
          startTransition(async () => {
            try {
              await rejectUserRegistration(userId, formData)
              toast.success(t("adminSettings.users.approval.rejected", { name: userName }))
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("adminSettings.users.approval.rejectError"))
            }
          })
        }}
        className="rounded-md border border-red-500/40 px-2.5 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
      >
        {t("adminSettings.users.approval.reject")}
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
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [role, setRole] = useState(user.role)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-200"
        aria-label={t("adminSettings.users.editAria")}
        title={t("adminSettings.users.editAria")}
      >
        <Edit2 className="h-4 w-4" />
      </button>

      {open && (
        <Modal title={t("adminSettings.users.dialog.editTitle")} onClose={() => setOpen(false)}>
          <form
            action={(fd) =>
              startTransition(async () => {
                try {
                  fd.set("role", role)
                  await updateUserAdmin(user.id, fd)
                  toast.success(t("adminSettings.users.dialog.saved"))
                  setOpen(false)
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t("adminSettings.users.dialog.saveError"))
                }
              })
            }
            className="space-y-4 p-6"
          >
            <Field label={`${t("adminSettings.users.dialog.name")} *`} name="name" defaultValue={user.name} required />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adminSettings.users.dialog.email")} name="email" type="email" defaultValue={user.email ?? ""} />
              <Field label={t("adminSettings.users.dialog.phone")} name="phone" type="tel" defaultValue={user.phone ?? ""} />
            </div>
            <RoleSelect role={role} setRole={setRole} roleOptions={roleOptions} />
            {isStaffLikeRole(role) && (
              <BuildingAccessField buildings={buildings} selectedIds={user.buildingIds} />
            )}
            <Field label={t("adminSettings.users.dialog.newPassword")} name="newPassword" type="password" placeholder={t("adminSettings.users.dialog.newPasswordPlaceholder")} />

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-sm text-slate-700 dark:text-slate-300">
                {t("common.actions.cancel")}
              </button>
              <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white disabled:opacity-60">
                {pending ? t("common.actions.saving") : t("common.actions.save")}
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
  const { t } = useT()
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
      toast.info(t("adminSettings.users.caps.lockedToast", {
        feature: capability.requiredFeatureLabel ?? capability.requiredFeature ?? "",
      }))
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
        toast.success(mode === "INHERIT"
          ? t("adminSettings.users.caps.overrideRemoved")
          : t("adminSettings.users.caps.overrideSaved"))
      } catch (error) {
        setLocalOverrides((current) => {
          const next = { ...current }
          if (before) next[capability.key] = before
          else delete next[capability.key]
          return next
        })
        toast.error(error instanceof Error ? error.message : t("adminSettings.users.caps.overrideError"))
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-purple-400 hover:text-purple-700 dark:hover:text-purple-200"
        aria-label={t("adminSettings.users.caps.button")}
        title={t("adminSettings.users.caps.button")}
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <Modal title={t("adminSettings.users.caps.title")} onClose={() => setOpen(false)} wide>
          <div className="space-y-4 p-6">
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-700 dark:text-purple-100">
              {t("adminSettings.users.caps.note", { user: userName, role: roleLabel })}
            </div>

            {effectiveSummary && (
              <div className="grid gap-2 sm:grid-cols-5">
                <RightsStat label={t("adminSettings.users.caps.statAllowed")} value={displaySummary.allowed} tone="blue" />
                <RightsStat label={t("adminSettings.users.caps.statRisky")} value={displaySummary.highRisk} tone={displaySummary.highRisk > 0 ? "amber" : "slate"} />
                <RightsStat label={t("adminSettings.users.caps.statPersonalAllow")} value={displaySummary.personalAllow} tone="emerald" />
                <RightsStat label={t("adminSettings.users.caps.statPersonalDeny")} value={displaySummary.personalDeny} tone="red" />
                <RightsStat label={t("adminSettings.users.caps.statLocked")} value={displaySummary.locked} tone="slate" />
              </div>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("adminSettings.users.caps.search")}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
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
                          className={`rounded-lg border p-3 ${ capability.locked ? "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 opacity-60" : mode === "ALLOW" ? "border-emerald-500/40 bg-emerald-500/10" : mode === "DENY" ? "border-red-500/40 bg-red-500/10" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50" }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                                {capability.label}
                                {effectiveState && <EffectiveStatePill state={effectiveState} />}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">{capability.description}</p>
                              {effectiveState && (
                                <p className="mt-2 text-[11px] text-slate-500">
                                  {t("adminSettings.users.caps.result", {
                                    state: effectiveState.allowed && !effectiveState.locked
                                      ? t("adminSettings.users.caps.allowed")
                                      : t("adminSettings.users.caps.denied"),
                                    source: t(`adminSettings.users.caps.sources.${CAPABILITY_SOURCE_KEYS[effectiveState.source]}`),
                                  })}
                                </p>
                              )}
                              {capability.locked && (
                                <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                                  {t("adminSettings.users.caps.lockedBy", {
                                    feature: capability.requiredFeatureLabel ?? capability.requiredFeature ?? "",
                                  })}
                                </p>
                              )}
                            </div>
                            {mode !== "INHERIT" && (
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ mode === "ALLOW" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200" : "bg-red-500/20 text-red-700 dark:text-red-200" }`}>
                                {mode === "ALLOW" ? t("adminSettings.users.caps.allowed") : t("adminSettings.users.caps.denied")}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <ModeButton active={mode === "INHERIT"} disabled={pending} onClick={() => updateOverride(capability, "INHERIT")}>
                              {t("adminSettings.users.caps.modeInherit")}
                            </ModeButton>
                            <ModeButton active={mode === "ALLOW"} disabled={pending || capability.locked} onClick={() => updateOverride(capability, "ALLOW")} tone="allow">
                              {t("adminSettings.users.caps.modeAllow")}
                            </ModeButton>
                            <ModeButton active={mode === "DENY"} disabled={pending || capability.locked} onClick={() => updateOverride(capability, "DENY")} tone="deny">
                              {t("adminSettings.users.caps.modeDeny")}
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
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-sm text-slate-700 dark:text-slate-300"
            >
              {t("common.actions.close")}
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
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200",
    slate: "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-700 dark:text-slate-300",
  }

  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-lg font-semibold">{value}</p>
      <p className="mt-1 text-[10px] opacity-75">{label}</p>
    </div>
  )
}

function EffectiveStatePill({ state }: { state: EffectiveCapabilityState }) {
  const { t } = useT()
  const allowed = state.allowed && !state.locked
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ state.locked ? "border-slate-200 dark:border-slate-700 text-slate-500" : allowed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200" }`}>
      {state.locked ? <Lock className="h-3 w-3" /> : allowed ? <ShieldCheck className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {state.locked
        ? t("adminSettings.users.caps.plan")
        : allowed
          ? t("adminSettings.users.caps.allowed")
          : t("adminSettings.users.caps.denied")}
    </span>
  )
}

// Откуда взялось итоговое право — ключ подписи в словаре (caps.sources).
const CAPABILITY_SOURCE_KEYS = {
  owner: "owner",
  personal_allow: "personalAllow",
  personal_deny: "personalDeny",
  role_action: "roleAction",
  role_section: "roleSection",
  fallback: "fallback",
  locked: "locked",
} as const satisfies Record<EffectiveCapabilityState["source"], string>

export function ResetPasswordDialog({ userId, userName }: { userId: string; userName: string }) {
  const { t } = useT()
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
      toast.error(t("adminSettings.users.reset.copyError"))
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-amber-400 hover:text-amber-700 dark:hover:text-amber-200"
        aria-label={t("adminSettings.users.reset.button")}
        title={t("adminSettings.users.reset.button")}
      >
        <Key className="h-4 w-4" />
      </button>

      {open && (
        <Modal title={t("adminSettings.users.reset.title")} onClose={close} narrow>
          <div className="space-y-4 p-6">
            {!done ? (
              <>
                <p className="text-sm text-slate-400">
                  {t("adminSettings.users.reset.hintBefore")} <span className="font-medium text-slate-800 dark:text-slate-200">{userName}</span>{t("adminSettings.users.reset.hintAfter")}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t("adminSettings.users.reset.placeholder")}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setPassword(genPassword())}
                    className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {t("adminSettings.users.reset.generate")}
                  </button>
                </div>
                <div className="flex gap-3">
                  <button onClick={close} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-sm text-slate-700 dark:text-slate-300">{t("common.actions.cancel")}</button>
                  <button
                    disabled={pending || password.length < 6}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          await resetUserPassword(userId, password)
                          toast.success(t("adminSettings.users.reset.updated"))
                          setDone(true)
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : t("adminSettings.users.reset.error"))
                        }
                      })
                    }}
                    className="flex-1 rounded-lg bg-amber-600 py-2 text-sm text-white disabled:opacity-60"
                  >
                    {pending ? "…" : t("adminSettings.users.reset.submit")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-400">
                  {t("adminSettings.users.reset.doneHint")}
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-sm text-slate-900 dark:text-slate-100">{password}</code>
                  <button
                    type="button"
                    onClick={copy}
                    className="shrink-0 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {copied ? t("adminSettings.users.reset.copied") : t("adminSettings.users.reset.copy")}
                  </button>
                </div>
                <button onClick={close} className="w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-900 hover:bg-white">
                  {t("adminSettings.users.reset.done")}
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
  const { t } = useT()
  const [, startTransition] = useTransition()
  // Статус строки берём из контекста — тогда вся строка (затемнение, бейдж)
  // меняется мгновенно без перезагрузки страницы. Откатываем при ошибке.
  const row = useContext(RowStatusContext)
  const active = row ? row.active : isActive
  const setActive = (next: boolean) => row?.setActiveOptimistic(next)
  if (disabled) return null

  return (
    <ConfirmDialog
      title={active ? t("adminSettings.users.toggle.deactivateTitle") : t("adminSettings.users.toggle.activateTitle")}
      description={active ? t("adminSettings.users.toggle.deactivateDesc") : t("adminSettings.users.toggle.activateDesc")}
      variant={active ? "danger" : "default"}
      confirmLabel={active ? t("adminSettings.users.toggle.deactivate") : t("adminSettings.users.toggle.activate")}
      onConfirm={() =>
        new Promise<void>((resolve) => {
          const next = !active
          setActive(next) // оптимистично
          startTransition(async () => {
            try {
              await toggleUserActive(userId, next)
              toast.success(next ? t("adminSettings.users.toggle.activated") : t("adminSettings.users.toggle.deactivated"))
            } catch (error) {
              setActive(!next) // откат при ошибке
              toast.error(error instanceof Error ? error.message : t("adminSettings.users.toggle.error"))
            } finally {
              resolve()
            }
          })
        })
      }
      trigger={
        <button
          className={active ? "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300" : "text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-200"}
          aria-label={active ? t("adminSettings.users.toggle.deactivate") : t("adminSettings.users.toggle.activate")}
          title={active ? t("adminSettings.users.toggle.activeHint") : t("adminSettings.users.toggle.inactiveHint")}
        >
          <Power className="h-4 w-4" />
        </button>
      }
    />
  )
}

export function DeleteUserButton({ userId, userName, disabled }: { userId: string; userName: string; disabled?: boolean }) {
  const { t } = useT()
  const row = useContext(RowStatusContext)
  return (
    <DeleteAction
      action={() => deleteUserAdmin(userId)}
      entity={t("adminSettings.users.remove.entity")}
      description={t("adminSettings.users.remove.description", { name: userName })}
      successMessage={t("adminSettings.users.remove.done")}
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
  const { t } = useT()
  const labelOf = useRoleLabel()
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">{t("adminSettings.users.dialog.role")} *</label>
      <select
        value={role}
        onChange={(event) => setRole(event.target.value)}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
      >
        {roleOptions.map((item) => (
          <option key={item.value} value={item.value}>{labelOf(item)}</option>
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
  const { t } = useT()
  const selected = new Set(selectedIds)

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">{t("adminSettings.users.dialog.buildings")} *</label>
      {buildings.length === 0 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t("adminSettings.users.dialog.noBuildingsHint")}
        </p>
      ) : (
        <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2">
          {buildings.map((building) => (
            <label key={building.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-800/50">
              <input
                type="checkbox"
                name="buildingIds"
                value={building.id}
                defaultChecked={selected.size > 0 ? selected.has(building.id) : buildings.length === 1}
                className="rounded border-slate-600"
              />
              <span className="text-slate-700 dark:text-slate-300">{building.name}</span>
            </label>
          ))}
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-500">
        {t("adminSettings.users.dialog.buildingsHint")}
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
  const inputCls = FIELD_CLS
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">{label}</label>
      {type === "tel" ? (
        <KzPhoneInput name={name} defaultValue={defaultValue} required={required} autoComplete="off" className={inputCls} />
      ) : type === "email" ? (
        <AsciiEmailInput name={name} defaultValue={defaultValue} required={required} autoComplete="off" className={inputCls} />
      ) : (
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
          required={required}
          minLength={minLength}
          className={inputCls}
        />
      )}
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
  const { t } = useT()
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
          placeholder={t("adminSettings.users.dialog.passwordPlaceholder")}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => setValue(genPassword())}
          className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {t("adminSettings.users.dialog.generate")}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {t("adminSettings.users.dialog.passwordHint")}
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
    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-100"
    : tone === "deny"
      ? "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-100"
      : "border-blue-500/50 bg-blue-500/15 text-blue-700 dark:text-blue-100"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${ active ? activeClass : "border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-200" }`}
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
  const { t } = useT()
  return (
    <ModalShell open onClose={onClose} title={title} className={`w-full rounded-2xl bg-white shadow-2xl dark:bg-slate-900 ${wide ? "max-w-3xl" : narrow ? "max-w-sm" : "max-w-md"}`}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} aria-label={t("common.actions.close")}>
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        {children}
    </ModalShell>
  )
}
