"use client"

import { useId, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Check, Plus, Save, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  createTenantBankAccount,
  deleteTenantBankAccount,
  setPrimaryTenantBankAccount,
  updateTenantBankAccount,
} from "@/app/actions/tenant"
import { validateRequisites } from "@/lib/kz-validators"
import { findBankByBik, findBankByName, findSingleBankSuggestion, isKnownBankName, KZ_BANKS } from "@/lib/kz-banks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ActionMenu } from "@/components/ui/action-menu"
import { ModalShell } from "@/components/ui/modal"
import { askConfirm } from "@/components/ui/dialog-host"
import { useT } from "@/lib/i18n/client"
import type { Translator } from "@/lib/i18n/translate"
import type { Messages } from "@/lib/i18n/messages"

/** Переводчик, который приходится передавать в функции вне компонента. */
type T = Translator<Messages>["t"]

type BankAccount = {
  id: string
  label: string | null
  bankName: string
  iik: string
  bik: string
  isPrimary: boolean
}

type Props = {
  tenantId: string
  initial: {
    bankName: string | null
    iik: string | null
    bik: string | null
    bin: string | null
    iin: string | null
    bankAccounts: BankAccount[]
  }
  isIin?: boolean
}

function StatusIcon({ ok }: { ok: boolean | null }) {
  const { t } = useT()
  if (ok === null) return null
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
      <Check className="h-3 w-3" /> {t("adminTenants.requisites.ok")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400">
      <AlertTriangle className="h-3 w-3" /> {t("adminTenants.requisites.error")}
    </span>
  )
}

function normalizeBik(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
}

function normalizeIikInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)
}

function shouldReplaceBankName(currentBankName: string, initialBankName?: string) {
  const value = currentBankName.trim()
  return !value || value === initialBankName || isKnownBankName(value)
}

function getBankInputError(bankName: string, bik: string, iik: string, t: T) {
  if (!bankName.trim()) return t("adminTenants.requisites.needBankName")
  if (!bik.trim()) return t("adminTenants.requisites.needBik")
  if (!iik.trim()) return t("adminTenants.requisites.needIik")

  const checks = validateRequisites({ bik, iik })
  if (checks.bik && !checks.bik.ok)
    return checks.bik.warningKey
      ? t(`common.requisiteChecks.${checks.bik.warningKey}` as "common.requisiteChecks.bikFormat")
      : t("adminTenants.requisites.badBik")
  if (checks.iik && !checks.iik.ok)
    return checks.iik.warningKey
      ? t(`common.requisiteChecks.${checks.iik.warningKey}` as "common.requisiteChecks.iikFormat")
      : t("adminTenants.requisites.badIik")
  return null
}

function showActionError(result: { error?: string; errorId?: string }, fallback: string, t: T) {
  const message = result.error ?? fallback
  toast.error(result.errorId ? t("adminTenants.requisites.errorCode", { message, code: result.errorId }) : message)
}

function BankFields({
  label,
  setLabel,
  bankName,
  setBankName,
  iik,
  setIik,
  bik,
  setBik,
  initialBankName,
}: {
  label: string
  setLabel: (value: string) => void
  bankName: string
  setBankName: (value: string) => void
  iik: string
  setIik: (value: string) => void
  bik: string
  setBik: (value: string) => void
  initialBankName?: string
}) {
  const { t } = useT()
  const bikListId = useId()
  const bankNameListId = useId()
  const checks = useMemo(() => validateRequisites({ bik, iik }), [bik, iik])
  const bankFromBik = useMemo(() => findBankByBik(bik), [bik])
  const bankNameSuggestion = useMemo(
    () => bankName && !findBankByName(bankName) ? findSingleBankSuggestion(bankName) : null,
    [bankName],
  )

  const handleBikChange = (value: string) => {
    const next = normalizeBik(value)
    setBik(next)
    const bank = findBankByBik(next)
    if (bank && shouldReplaceBankName(bankName, initialBankName)) {
      setBankName(bank.name)
    }
  }

  const handleBankNameChange = (value: string) => {
    const next = value.slice(0, 160)
    setBankName(next)
    const bank = findBankByName(next) ?? findSingleBankSuggestion(next)
    if (bank) setBik(bank.bik)
  }

  const handleBankNameBlur = () => {
    const bank = findBankByName(bankName) ?? findSingleBankSuggestion(bankName)
    if (!bank) return
    setBankName(bank.name)
    setBik(bank.bik)
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
          {t("adminTenants.requisites.accountLabel")}
        </label>
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value.slice(0, 80))}
          placeholder={t("adminTenants.requisites.accountLabelPlaceholder")}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminTenants.requisites.bik")}</label>
          {bik && <StatusIcon ok={checks.bik?.ok ?? null} />}
        </div>
        <Input
          name="bik"
          value={bik}
          onChange={(event) => handleBikChange(event.target.value)}
          onBlur={() => {
            const bank = findBankByBik(bik)
            if (bank && shouldReplaceBankName(bankName, initialBankName)) setBankName(bank.name)
          }}
          placeholder="HSBKKZKX"
          list={bikListId}
          pattern="[A-Z]{8,11}"
          maxLength={8}
          className={`font-mono uppercase ${
            !bik
              ? ""
              : checks.bik?.ok
                ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-500/40"
                : "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/40"
          }`}
        />
        <datalist id={bikListId}>
          {KZ_BANKS.map((bank) => (
            <option key={bank.bik} value={bank.bik} label={`${bank.short} — ${bank.name}`} />
          ))}
        </datalist>
        {!bik && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("adminTenants.requisites.bikHint")}</p>
        )}
        {bankFromBik && (
          <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">{bankFromBik.name}</p>
        )}
        {bik && checks.bik?.warningKey && (
          <p className={`mt-1 text-[10px] ${checks.bik.ok ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
            {t(`common.requisiteChecks.${checks.bik.warningKey}` as "common.requisiteChecks.bikFormat")}
          </p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
          {t("adminTenants.requisites.bankName")}
        </label>
        <Input
          value={bankName}
          onChange={(event) => handleBankNameChange(event.target.value)}
          onBlur={handleBankNameBlur}
          list={bankNameListId}
          placeholder={t("adminTenants.requisites.bankNamePlaceholder")}
        />
        <datalist id={bankNameListId}>
          {KZ_BANKS.map((bank) => (
            <option key={bank.bik} value={bank.name} label={`${bank.bik} — ${bank.short}`} />
          ))}
        </datalist>
        {bankNameSuggestion && (
          <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">
            {t("adminTenants.requisites.bankFound", { name: bankNameSuggestion.name })}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            {t("adminTenants.requisites.iik")} <span className="text-slate-400">{t("adminTenants.requisites.iikChars")}</span>
          </label>
          {iik && <StatusIcon ok={checks.iik?.ok ?? null} />}
        </div>
        <Input
          name="iik"
          value={iik}
          onChange={(event) => setIik(normalizeIikInput(event.target.value))}
          placeholder="KZ123456789012345678"
          pattern="^KZ[A-Za-z0-9]{18}$"
          maxLength={32}
          className={`font-mono uppercase ${
            !iik
              ? ""
              : checks.iik?.ok
                ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-500/40"
                : "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/40"
          }`}
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("adminTenants.requisites.iikHint", { length: iik.length })}</p>
        {iik && checks.iik?.warningKey && (
          <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">
            {t(`common.requisiteChecks.${checks.iik.warningKey}` as "common.requisiteChecks.iikFormat")}
          </p>
        )}
      </div>
    </div>
  )
}

/** Одна строка счёта: название, банк, ИИК и меню действий. */
function AccountRow({ account }: { account: BankAccount }) {
  const { t } = useT()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()

  const makePrimary = () => {
    startTransition(async () => {
      try {
        const result = await setPrimaryTenantBankAccount(account.id)
        if (!result.ok) { showActionError(result, t("adminTenants.requisites.primaryFailed"), t); return }
        router.refresh()
        toast.success(t("adminTenants.requisites.primaryDone"))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("adminTenants.requisites.primaryFailed"))
      }
    })
  }

  const remove = () => {
    startTransition(async () => {
      try {
        const result = await deleteTenantBankAccount(account.id)
        if (!result.ok) { showActionError(result, t("adminTenants.requisites.deleteFailed"), t); return }
        router.refresh()
        toast.success(t("adminTenants.requisites.deleted"))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("adminTenants.requisites.deleteFailed"))
      }
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
            {account.label || account.bankName}
            {account.isPrimary && (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <Star className="h-3 w-3 fill-current" /> {t("adminTenants.requisites.primary")}
              </Badge>
            )}
          </p>
          <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
            {account.iik} · {account.bankName} · {account.bik}
          </p>
        </div>
        <ActionMenu
          tone="icon"
          label="⋯"
          ariaLabel={t("adminTenants.requisites.menuLabel")}
          align="end"
          width="w-56"
          items={[
            { label: t("adminTenants.requisites.edit"), icon: <Save className="h-4 w-4 text-slate-400" />, onSelect: () => setEditing(true), disabled: pending },
            ...(account.isPrimary ? [] : [{ label: t("adminTenants.requisites.makePrimary"), icon: <Star className="h-4 w-4 text-slate-400" />, onSelect: makePrimary, disabled: pending }]),
            {
              label: t("adminTenants.requisites.deleteAccount"),
              icon: <Trash2 className="h-4 w-4" />,
              danger: true,
              separatorBefore: true,
              disabled: pending,
              onSelect: () => {
                void (async () => {
                  if (!(await askConfirm({
                    title: t("adminTenants.requisites.deleteTitle"),
                    description: t("adminTenants.requisites.deleteText"),
                    confirmLabel: t("common.actions.delete"),
                    danger: true,
                  }))) return
                  remove()
                })()
              },
            },
          ]}
        />
      </div>
      {editing && (
        <AccountDialog
          title={t("adminTenants.requisites.dialogEdit")}
          initial={account}
          onClose={() => setEditing(false)}
          onSave={async (fd) => {
            const result = await updateTenantBankAccount(account.id, fd)
            if (!result.ok) { showActionError(result, t("adminTenants.requisites.saveFailed"), t); return false }
            toast.success(t("adminTenants.requisites.saved"))
            router.refresh()
            return true
          }}
        />
      )}
    </>
  )
}

/** Окно добавления/правки счёта — поля те же, сохранение одно. */
function AccountDialog({
  title,
  initial,
  withPrimary,
  onClose,
  onSave,
}: {
  title: string
  initial?: Partial<BankAccount>
  withPrimary?: boolean
  onClose: () => void
  onSave: (fd: FormData) => Promise<boolean>
}) {
  const { t } = useT()
  const [label, setLabel] = useState(initial?.label ?? "")
  const [bankName, setBankName] = useState(initial?.bankName ?? "")
  const [iik, setIik] = useState(initial?.iik ?? "")
  const [bik, setBik] = useState(initial?.bik ?? "")
  const [isPrimary, setIsPrimary] = useState(false)
  const [pending, startTransition] = useTransition()
  const inputError = useMemo(() => getBankInputError(bankName, bik, iik, t), [bankName, bik, iik, t])

  const submit = () => {
    if (inputError) { toast.error(inputError); return }
    const fd = new FormData()
    fd.set("label", label)
    fd.set("bankName", bankName)
    fd.set("iik", iik)
    fd.set("bik", bik)
    if (withPrimary && isPrimary) fd.set("isPrimary", "on")
    startTransition(async () => {
      try {
        if (await onSave(fd)) onClose()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("adminTenants.requisites.saveFailed"))
      }
    })
  }

  return (
    <ModalShell open onClose={onClose} title={title} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
      <div className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <BankFields
          label={label}
          setLabel={setLabel}
          bankName={bankName}
          setBankName={setBankName}
          iik={iik}
          setIik={setIik}
          bik={bik}
          setBik={setBik}
          initialBankName={initial?.bankName ?? ""}
        />
        {withPrimary && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
            {t("adminTenants.requisites.primaryCheckbox")}
          </label>
        )}
        {inputError && <p className="text-xs text-amber-600 dark:text-amber-400">{inputError}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={onClose}>{t("common.actions.cancel")}</Button>
          <Button type="button" onClick={submit} loading={pending} disabled={!!inputError}>{t("adminTenants.requisites.saveAccount")}</Button>
        </div>
      </div>
    </ModalShell>
  )
}

/**
 * Банковские счета арендатора. Раньше на этой вкладке было три кнопки
 * «Сохранить» (компания, БИН/ИИН, счёт) и дубль поля ИИН — теперь ИИН и
 * данные компании сохраняются одной кнопкой формы компании, а счета живут
 * отдельным списком с окном правки.
 */
export function RequisitesForm({ tenantId, initial }: Props) {
  const { t } = useT()
  const router = useRouter()
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-3 p-5">
      {initial.bankAccounts.length === 0 ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          {t("adminTenants.requisites.empty")}
        </p>
      ) : (
        initial.bankAccounts.map((account) => <AccountRow key={account.id} account={account} />)
      )}

      <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
        {t("adminTenants.requisites.add")}
      </Button>

      {adding && (
        <AccountDialog
          title={t("adminTenants.requisites.dialogNew")}
          withPrimary
          onClose={() => setAdding(false)}
          onSave={async (fd) => {
            const result = await createTenantBankAccount(tenantId, fd)
            if (!result.ok) { showActionError(result, t("adminTenants.requisites.addFailed"), t); return false }
            toast.success(t("adminTenants.requisites.added"))
            router.refresh()
            return true
          }}
        />
      )}
    </div>
  )
}
