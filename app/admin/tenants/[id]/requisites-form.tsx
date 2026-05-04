"use client"

import { useMemo, useState, useTransition } from "react"
import { Check, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { updateTenantRequisites } from "@/app/actions/tenant"
import { validateRequisites } from "@/lib/kz-validators"
import { findBankByBik, KZ_BANKS } from "@/lib/kz-banks"

type Props = {
  tenantId: string
  initial: {
    bankName: string | null
    iik: string | null
    bik: string | null
    bin: string | null
    iin: string | null
  }
  /** Если арендатор — ИП или физлицо, поле подписывается ИИН (то же поле bin в схеме). */
  isIin?: boolean
}

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === null) return null
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
      <Check className="h-3 w-3" /> РћРљ
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 font-medium">
      <AlertTriangle className="h-3 w-3" /> РћС€РёР±РєР°
    </span>
  )
}

export function RequisitesForm({ tenantId, initial, isIin }: Props) {
  const [bankName, setBankName] = useState(initial.bankName ?? "")
  const [iik, setIik] = useState(initial.iik ?? "")
  const [bik, setBik] = useState(initial.bik ?? "")
  const [taxId, setTaxId] = useState(isIin ? initial.iin ?? initial.bin ?? "" : initial.bin ?? "")
  const [pending, startTransition] = useTransition()

  // Живая валидация — пересчитывается на каждое изменение
  const checks = useMemo(() => {
    return validateRequisites({
      bik,
      iik,
      bin: !isIin ? taxId : undefined,
      iin: isIin ? taxId : undefined,
    })
  }, [bik, iik, taxId, isIin])

  // Автозаполнение названия банка по БИК
  const bankFromBik = useMemo(() => findBankByBik(bik), [bik])
  const handleBikChange = (v: string) => {
    const upper = v.toUpperCase()
    setBik(upper)
    const bank = findBankByBik(upper)
    if (bank && (!bankName || bankName === initial.bankName)) {
      setBankName(bank.name)
    }
  }

  const onSubmit = (formData: FormData) => {
    formData.set("bankName", bankName)
    formData.set("iik", iik)
    formData.set("bik", bik)
    formData.set(isIin ? "iin" : "bin", taxId)
    formData.set(isIin ? "bin" : "iin", "")
    startTransition(async () => {
      try {
        await updateTenantRequisites(tenantId, formData)
        toast.success("Реквизиты сохранены")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
      }
    })
  }

  return (
    <form action={onSubmit} className="p-5 grid grid-cols-2 gap-4">
      {/* БИК — первым, так как от него подтягивается название банка */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">БИК банка</label>
          {bik && <StatusIcon ok={checks.bik?.ok ?? null} />}
        </div>
        <input
          name="bik_visible"
          value={bik}
          onChange={(e) => handleBikChange(e.target.value)}
          placeholder="HSBKKZKX, KCJBKZKX..."
          list="kz-banks-list"
          maxLength={8}
          className={`w-full rounded-lg border px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 ${
            !bik
              ? "border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-blue-500/20"
              : checks.bik?.ok
                ? "border-emerald-300 dark:border-emerald-500/40 focus:border-emerald-500 focus:ring-emerald-500/20"
                : "border-red-300 dark:border-red-500/40 focus:border-red-500 focus:ring-red-500/20"
          }`}
        />
        <datalist id="kz-banks-list">
          {KZ_BANKS.map((b) => (
            <option key={b.bik} value={b.bik}>{b.short}</option>
          ))}
        </datalist>
        {bankFromBik && (
          <p className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-1">
            ✓ {bankFromBik.name}
          </p>
        )}
        {bik && checks.bik?.warning && (
          <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">{checks.bik.warning}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Название банка</label>
        <input
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          placeholder="Подтянется автоматически из БИК"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div className="col-span-2">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">ИИК (расчётный счёт)</label>
          {iik && <StatusIcon ok={checks.iik?.ok ?? null} />}
        </div>
        <input
          value={iik}
          onChange={(e) => setIik(e.target.value.toUpperCase().replace(/\s+/g, ""))}
          placeholder="KZ86125KZT1001300335"
          maxLength={20}
          className={`w-full rounded-lg border px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 ${
            !iik
              ? "border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-blue-500/20"
              : checks.iik?.ok
                ? "border-emerald-300 dark:border-emerald-500/40 focus:border-emerald-500 focus:ring-emerald-500/20"
                : "border-red-300 dark:border-red-500/40 focus:border-red-500 focus:ring-red-500/20"
          }`}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          Длина: {iik.length}/20
        </p>
        {iik && checks.iik?.warning && (
          <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">{checks.iik.warning}</p>
        )}
        {checks.consistency && !checks.consistency.ok && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
            ⚠ {checks.consistency.warning}
          </p>
        )}
      </div>

      <div className="col-span-2">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            {isIin ? "ИИН" : "БИН"} <span className="text-slate-300 dark:text-slate-600">12 цифр</span>
          </label>
          {taxId && <StatusIcon ok={(isIin ? checks.iin?.ok : checks.bin?.ok) ?? null} />}
        </div>
        <input
          value={taxId}
          onChange={(e) => setTaxId(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
          placeholder="123456789012"
          maxLength={12}
          inputMode="numeric"
          className={`w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 ${
            !taxId
              ? "border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-blue-500/20"
              : (isIin ? checks.iin?.ok : checks.bin?.ok)
                ? "border-emerald-300 dark:border-emerald-500/40"
                : "border-red-300 dark:border-red-500/40"
          }`}
        />
        {taxId && (isIin ? checks.iin?.warning : checks.bin?.warning) && (
          <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
            {isIin ? checks.iin?.warning : checks.bin?.warning}
          </p>
        )}
      </div>

      <div className="col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Сохранение..." : "Сохранить реквизиты"}
        </button>
      </div>
    </form>
  )
}
