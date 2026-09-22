"use client"
import { ModalShell } from "@/components/ui/modal"

import { useState, useTransition } from "react"
import { Plus, X, Edit2, UserX, UserCheck, Banknote, CheckCircle, RefreshCw, Copy } from "lucide-react"
import { toast } from "sonner"
import { createStaff, updateStaff, deactivateStaff, reactivateStaff } from "@/app/actions/staff"
import { generateSalaryPayments, markSalaryPaid } from "@/app/actions/salary"
import { KzPhoneInput, AsciiEmailInput } from "@/components/forms/contact-inputs"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/client"

// «Владелец» намеренно отсутствует: владелец в организации один,
// создать или назначить второго нельзя (защита и на сервере).
const ROLE_VALUES = ["ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"] as const

/** Одноразовый пароль: без похожих символов (0/O, 1/l/I), криптослучайный */
function generateOneTimePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  const bytes = new Uint32Array(10)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

type BuildingOption = { id: string; name: string }

export function CreateStaffDialog({ buildings }: { buildings: BuildingOption[] }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <>
      <Button
        onClick={() => { setPassword(generateOneTimePassword()); setOpen(true) }}
        leftIcon={<Plus className="h-4 w-4" />}
      >
        {t("adminSettings.staff.dialog.add")}
      </Button>

      <ModalShell open={open} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.staff.dialog.newTitle")}</h2>
              <button onClick={() => setOpen(false)} aria-label={t("common.actions.close")} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              autoComplete="off"
              action={(fd) => startTransition(async () => {
                try {
                  await createStaff(fd)
                  toast.success(t("adminSettings.staff.dialog.created"))
                  setOpen(false)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t("adminSettings.staff.dialog.createError"))
                }
              })}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.fio")} *</label>
                <input name="name" required autoComplete="off" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.phone")}</label>
                  <KzPhoneInput name="phone" autoComplete="off" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.email")}</label>
                  <AsciiEmailInput name="email" autoComplete="off" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.role")}</label>
                  <select name="role" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                    {ROLE_VALUES.map((value) => <option key={value} value={value}>{t(`adminSettings.staff.roles.${value}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.position")}</label>
                  <input name="position" required autoComplete="off" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.salary")}</label>
                  <input name="salary" type="number" defaultValue="0" autoComplete="off" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.oneTimePassword")}</label>
                  <div className="flex items-center gap-1">
                    <input
                      name="password"
                      value={password}
                      readOnly
                      className="w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 font-mono text-sm focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setPassword(generateOneTimePassword())}
                      title={t("adminSettings.staff.dialog.regenerate")}
                      aria-label={t("adminSettings.staff.dialog.regenerate")}
                      className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(password).then(() => toast.success(t("adminSettings.staff.dialog.passwordCopied"))) }}
                      title={t("adminSettings.staff.dialog.copyPassword")}
                      aria-label={t("adminSettings.staff.dialog.copyPassword")}
                      className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                    {t("adminSettings.staff.dialog.passwordHint")}
                  </p>
                </div>
              </div>
              <BuildingAccessField buildings={buildings} />
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  {pending ? t("adminSettings.staff.dialog.creating") : t("adminSettings.staff.dialog.create")}
                </Button>
              </div>
            </form>
          </ModalShell>
    </>
  )
}

type StaffUser = {
  id: string
  name: string
  phone: string | null
  email: string | null
  role: string
  isActive: boolean
  staff: { id: string; position: string; salary: number } | null
  buildingIds: string[]
}

export function EditStaffDialog({ user, buildings }: { user: StaffUser; buildings: BuildingOption[] }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
        <Edit2 className="h-3 w-3" />
        {t("common.actions.edit")}
      </button>

      <ModalShell open={open} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.staff.dialog.editTitle")}</h2>
              <button onClick={() => setOpen(false)} aria-label={t("common.actions.close")} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              autoComplete="off"
              action={(fd) => startTransition(async () => {
                try {
                  if (user.staff) await updateStaff(user.staff.id, user.id, fd)
                  toast.success(t("adminSettings.staff.dialog.saved"))
                  setOpen(false)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t("adminSettings.staff.dialog.saveError"))
                }
              })}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.fio")}</label>
                <input name="name" defaultValue={user.name} required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.phone")}</label>
                  <KzPhoneInput name="phone" autoComplete="off" defaultValue={user.phone ?? ""} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.email")}</label>
                  <AsciiEmailInput name="email" autoComplete="off" defaultValue={user.email ?? ""} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.role")}</label>
                  {/* Роль владельца неприкосновенна; остальным «Владелец» недоступен */}
                  <select
                    name="role"
                    defaultValue={user.role}
                    disabled={user.role === "OWNER"}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900 disabled:opacity-60"
                  >
                    {(user.role === "OWNER" ? (["OWNER"] as const) : ROLE_VALUES).map((value) => (
                      <option key={value} value={value}>{t(`adminSettings.staff.roles.${value}`)}</option>
                    ))}
                  </select>
                  {/* disabled-select не попадает в FormData — дублируем значение */}
                  {user.role === "OWNER" && <input type="hidden" name="role" value="OWNER" />}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.position")}</label>
                  <input name="position" defaultValue={user.staff?.position ?? ""} required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.salary")}</label>
                  <input name="salary" type="number" defaultValue={user.staff?.salary ?? 0} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminSettings.staff.dialog.newPassword")}</label>
                  <input name="newPassword" type="password" placeholder={t("adminSettings.staff.dialog.newPasswordPlaceholder")} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <BuildingAccessField buildings={buildings} selectedIds={user.buildingIds} />
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  {pending ? t("common.actions.saving") : t("common.actions.save")}
                </Button>
              </div>
            </form>
          </ModalShell>
    </>
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
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
        {t("adminSettings.staff.dialog.buildings")} *
      </label>
      {buildings.length === 0 ? (
        <p className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t("adminSettings.staff.dialog.noBuildingsHint")}
        </p>
      ) : (
        <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 p-2 space-y-1.5">
          {buildings.map((building) => (
            <label key={building.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <input
                type="checkbox"
                name="buildingIds"
                value={building.id}
                defaultChecked={selected.size > 0 ? selected.has(building.id) : buildings.length === 1}
                className="rounded border-slate-300"
              />
              <span className="text-slate-700 dark:text-slate-300">{building.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function GenerateSalaryButton({ period }: { period: string }) {
  const { t, tp } = useT()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-xs text-emerald-600 dark:text-emerald-400">{result}</span>}
      <button
        onClick={() => startTransition(async () => {
          const r = await generateSalaryPayments(period)
          setResult(r.created > 0
            ? tp("adminSettings.staff.salary.created", r.created, { period })
            : t("adminSettings.staff.salary.already"))
          setTimeout(() => setResult(null), 4000)
        })}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-60"
      >
        <Banknote className="h-4 w-4" />
        {pending ? t("adminSettings.staff.salary.creating") : t("adminSettings.staff.salary.generate")}
      </button>
    </div>
  )
}

export function MarkSalaryPaidButton({ salaryPaymentId }: { salaryPaymentId: string }) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(async () => { await markSalaryPaid(salaryPaymentId) })}
      disabled={pending}
      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 disabled:opacity-50"
    >
      <CheckCircle className="h-3 w-3" />
      {pending ? "…" : t("adminSettings.staff.salary.pay")}
    </button>
  )
}

export function DeactivateButton({ userId, isActive }: { userId: string; isActive: boolean }) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()

  return (
    <form action={() => startTransition(async () => {
      if (isActive) await deactivateStaff(userId)
      else await reactivateStaff(userId)
    })}>
      <button
        type="submit"
        disabled={pending}
        className={`text-xs flex items-center gap-1 ${
          isActive
            ? "text-red-500 hover:text-red-700 dark:text-red-300"
            : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200"
        } disabled:opacity-50`}
      >
        {isActive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
        {pending ? "…" : isActive ? t("adminSettings.staff.dismiss") : t("adminSettings.staff.restore")}
      </button>
    </form>
  )
}
