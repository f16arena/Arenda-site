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
  updateTenantRequisites,
} from "@/app/actions/tenant"
import { validateRequisites } from "@/lib/kz-validators"
import { findBankByBik, findBankByName, findSingleBankSuggestion, isKnownBankName, KZ_BANKS } from "@/lib/kz-banks"

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
  if (ok === null) return null
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
      <Check className="h-3 w-3" /> OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400">
      <AlertTriangle className="h-3 w-3" /> Ошибка
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

function getBankInputError(bankName: string, bik: string, iik: string) {
  if (!bankName.trim()) return "Укажите название банка"
  if (!bik.trim()) return "Укажите БИК"
  if (!iik.trim()) return "Укажите ИИК"

  const checks = validateRequisites({ bik, iik })
  if (checks.bik && !checks.bik.ok) return checks.bik.warning ?? "Некорректный БИК"
  if (checks.iik && !checks.iik.ok) return checks.iik.warning ?? "Некорректный ИИК"
  return null
}

function showActionError(result: { error?: string; errorId?: string }, fallback: string) {
  const message = result.error ?? fallback
  toast.error(result.errorId ? `${message}. Код ошибки #${result.errorId}` : message)
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
          Название счета
        </label>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value.slice(0, 80))}
          placeholder="Например: основной, Kaspi, Halyk"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">БИК банка</label>
          {bik && <StatusIcon ok={checks.bik?.ok ?? null} />}
        </div>
        <input
          value={bik}
          onChange={(event) => handleBikChange(event.target.value)}
          onBlur={() => {
            const bank = findBankByBik(bik)
            if (bank && shouldReplaceBankName(bankName, initialBankName)) setBankName(bank.name)
          }}
          placeholder="CASPKZKA, HSBKKZKX..."
          list={bikListId}
          maxLength={8}
          className={`w-full rounded-lg border px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 ${
            !bik
              ? "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800"
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
        {bankFromBik && (
          <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">{bankFromBik.name}</p>
        )}
        {bik && checks.bik?.warning && (
          <p className={`mt-1 text-[10px] ${checks.bik.ok ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
            {checks.bik.warning}
          </p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Название банка
        </label>
        <input
          value={bankName}
          onChange={(event) => handleBankNameChange(event.target.value)}
          onBlur={handleBankNameBlur}
          list={bankNameListId}
          placeholder="Начните писать банк или выберите из списка"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800"
        />
        <datalist id={bankNameListId}>
          {KZ_BANKS.map((bank) => (
            <option key={bank.bik} value={bank.name} label={`${bank.bik} — ${bank.short}`} />
          ))}
        </datalist>
        {bankNameSuggestion && (
          <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">
            Найдено: {bankNameSuggestion.name}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            ИИК <span className="text-slate-400">20 символов</span>
          </label>
          {iik && <StatusIcon ok={checks.iik?.ok ?? null} />}
        </div>
        <input
          value={iik}
          onChange={(event) => setIik(normalizeIikInput(event.target.value))}
          placeholder="KZ86125KZT1001300335"
          maxLength={20}
          className={`w-full rounded-lg border px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 ${
            !iik
              ? "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800"
              : checks.iik?.ok
                ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-500/40"
                : "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/40"
          }`}
        />
        <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Длина: {iik.length}/20</p>
        {iik && checks.iik?.warning && (
          <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">{checks.iik.warning}</p>
        )}
      </div>
    </div>
  )
}

function ExistingAccount({ account }: { account: BankAccount }) {
  const router = useRouter()
  const [label, setLabel] = useState(account.label ?? "")
  const [bankName, setBankName] = useState(account.bankName)
  const [iik, setIik] = useState(account.iik)
  const [bik, setBik] = useState(account.bik)
  const [pending, startTransition] = useTransition()
  const inputError = useMemo(() => getBankInputError(bankName, bik, iik), [bankName, bik, iik])

  const save = () => {
    if (inputError) {
      toast.error(inputError)
      return
    }
    const formData = new FormData()
    formData.set("label", label)
    formData.set("bankName", bankName)
    formData.set("iik", iik)
    formData.set("bik", bik)
    startTransition(async () => {
      try {
        const result = await updateTenantBankAccount(account.id, formData)
        if (!result.ok) {
          showActionError(result, "Не удалось сохранить счёт")
          return
        }
        router.refresh()
        toast.success("Счёт сохранён")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось сохранить счёт")
      }
    })
  }

  const makePrimary = () => {
    startTransition(async () => {
      try {
        const result = await setPrimaryTenantBankAccount(account.id)
        if (!result.ok) {
          showActionError(result, "Не удалось выбрать основной счёт")
          return
        }
        router.refresh()
        toast.success("Основной счёт обновлён")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось выбрать основной счёт")
      }
    })
  }

  const remove = () => {
    if (!window.confirm("Удалить этот банковский счёт арендатора?")) return
    startTransition(async () => {
      try {
        const result = await deleteTenantBankAccount(account.id)
        if (!result.ok) {
          showActionError(result, "Не удалось удалить счёт")
          return
        }
        router.refresh()
        toast.success("Счёт удалён")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось удалить счёт")
      }
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {label || account.label || "Банковский счёт"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{account.iik}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {account.isPrimary ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
              <Star className="h-3.5 w-3.5 fill-current" /> Основной
            </span>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={makePrimary}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <Star className="h-3.5 w-3.5" /> Сделать основным
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-60 dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" /> Удалить
          </button>
        </div>
      </div>

      <BankFields
        label={label}
        setLabel={setLabel}
        bankName={bankName}
        setBankName={setBankName}
        iik={iik}
        setIik={setIik}
        bik={bik}
        setBik={setBik}
        initialBankName={account.bankName}
      />

      <div className="mt-4 flex justify-end">
        <div className="flex flex-col items-end gap-1">
          {inputError && <p className="text-[11px] text-amber-600 dark:text-amber-400">{inputError}</p>}
          <button
            type="button"
            disabled={pending || !!inputError}
            onClick={save}
            title={inputError ?? undefined}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {pending ? "Сохранение..." : "Сохранить счёт"}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddAccountForm({ tenantId }: { tenantId: string }) {
  const router = useRouter()
  const [label, setLabel] = useState("")
  const [bankName, setBankName] = useState("")
  const [iik, setIik] = useState("")
  const [bik, setBik] = useState("")
  const [isPrimary, setIsPrimary] = useState(false)
  const [pending, startTransition] = useTransition()
  const inputError = useMemo(() => getBankInputError(bankName, bik, iik), [bankName, bik, iik])

  const submit = () => {
    if (inputError) {
      toast.error(inputError)
      return
    }
    const formData = new FormData()
    formData.set("label", label)
    formData.set("bankName", bankName)
    formData.set("iik", iik)
    formData.set("bik", bik)
    if (isPrimary) formData.set("isPrimary", "on")

    startTransition(async () => {
      try {
        const result = await createTenantBankAccount(tenantId, formData)
        if (!result.ok) {
          showActionError(result, "Не удалось добавить счёт")
          return
        }
        router.refresh()
        setLabel("")
        setBankName("")
        setIik("")
        setBik("")
        setIsPrimary(false)
        toast.success("Счёт добавлен")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось добавить счёт")
      }
    })
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Добавить банковский счёт</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Можно хранить несколько счетов арендатора.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(event) => setIsPrimary(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          Основной
        </label>
      </div>

      <BankFields
        label={label}
        setLabel={setLabel}
        bankName={bankName}
        setBankName={setBankName}
        iik={iik}
        setIik={setIik}
        bik={bik}
        setBik={setBik}
      />

      <div className="mt-4 flex justify-end">
        <div className="flex flex-col items-end gap-1">
          {inputError && <p className="text-[11px] text-amber-600 dark:text-amber-400">{inputError}</p>}
          <button
            type="button"
            disabled={pending || !!inputError}
            onClick={submit}
            title={inputError ?? undefined}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {pending ? "Добавление..." : "Добавить счёт"}
          </button>
        </div>
      </div>
    </div>
  )
}

function TaxIdentityForm({ tenantId, initial, isIin }: Props) {
  const router = useRouter()
  const [taxId, setTaxId] = useState(isIin ? initial.iin ?? initial.bin ?? "" : initial.bin ?? "")
  const [pending, startTransition] = useTransition()

  const checks = useMemo(() => {
    return validateRequisites({
      bin: !isIin ? taxId : undefined,
      iin: isIin ? taxId : undefined,
    })
  }, [taxId, isIin])

  const save = () => {
    const formData = new FormData()
    formData.set(isIin ? "iin" : "bin", taxId)
    formData.set(isIin ? "bin" : "iin", "")

    startTransition(async () => {
      try {
        const result = await updateTenantRequisites(tenantId, formData)
        if (!result.ok) {
          showActionError(result, "Не удалось сохранить данные")
          return
        }
        router.refresh()
        toast.success("Налоговые данные сохранены")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось сохранить данные")
      }
    })
  }

  const taxCheck = isIin ? checks.iin : checks.bin

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          {isIin ? "ИИН" : "БИН"} <span className="text-slate-400">12 цифр</span>
        </label>
        {taxId && <StatusIcon ok={taxCheck?.ok ?? null} />}
      </div>
      <input
        value={taxId}
        onChange={(event) => setTaxId(event.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
        placeholder="123456789012"
        maxLength={12}
        inputMode="numeric"
        className={`w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 ${
          !taxId
            ? "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800"
            : taxCheck?.ok
              ? "border-emerald-300 dark:border-emerald-500/40"
              : "border-red-300 dark:border-red-500/40"
        }`}
      />
      {taxId && taxCheck?.warning && (
        <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">{taxCheck.warning}</p>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </div>
  )
}

export function RequisitesForm({ tenantId, initial, isIin }: Props) {
  return (
    <div className="space-y-4 p-5">
      <TaxIdentityForm tenantId={tenantId} initial={initial} isIin={isIin} />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Банковские счета</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Основной счёт используется в договорах, счетах и старых шаблонах.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {initial.bankAccounts.length}
          </span>
        </div>

        {initial.bankAccounts.length === 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
            Банковские счета не добавлены. Добавьте хотя бы один счёт, чтобы реквизиты подставлялись в документы.
          </div>
        ) : (
          initial.bankAccounts.map((account) => (
            <ExistingAccount key={account.id} account={account} />
          ))
        )}

        <AddAccountForm tenantId={tenantId} />
      </div>
    </div>
  )
}
