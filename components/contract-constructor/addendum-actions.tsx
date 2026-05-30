"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CalendarPlus, FileX, Loader2, Coins } from "lucide-react"
import {
  createExtensionAddendum,
  createTerminationAddendum,
  createRentalTermsAddendum,
} from "@/app/actions/contract-addendums"

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"

type Mode = null | "extend" | "terminate" | "rent"

/** ДС к подписанному договору: продление, расторжение или изменение условий аренды. */
export function AddendumActions({ contractId }: { contractId: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(null)
  const [date, setDate] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  // Изменение условий аренды
  const [rentKind, setRentKind] = useState<"RATE" | "FIXED">("FIXED")
  const [rentValue, setRentValue] = useState("")
  const [cleaning, setCleaning] = useState("")
  const [deposit, setDeposit] = useState("")
  const [rentFree, setRentFree] = useState("")
  const [moveIn, setMoveIn] = useState("")

  function reset() {
    setMode(null); setDate(""); setReason(""); setRentValue(""); setCleaning("")
    setDeposit(""); setRentFree(""); setMoveIn("")
  }

  async function submit() {
    setBusy(true)
    try {
      let r: { ok: boolean; error?: string }
      if (mode === "extend") {
        if (!date) { toast.error("Укажите дату"); return }
        r = await createExtensionAddendum(contractId, date)
      } else if (mode === "terminate") {
        if (!date) { toast.error("Укажите дату"); return }
        r = await createTerminationAddendum(contractId, date, reason.trim() || undefined)
      } else if (mode === "rent") {
        const v = Number(rentValue.replace(",", "."))
        if (!Number.isFinite(v) || v <= 0) { toast.error("Укажите новую стоимость аренды"); return }
        r = await createRentalTermsAddendum(
          contractId,
          {
            customRate: rentKind === "RATE" ? v : null,
            fixedMonthlyRent: rentKind === "FIXED" ? v : null,
            cleaningFee: cleaning.trim() ? Number(cleaning.replace(",", ".")) : undefined,
            depositAmount: deposit.trim() ? Number(deposit.replace(",", ".")) : undefined,
            rentFreeMonths: rentFree.trim() ? Number(rentFree) : undefined,
            moveInDate: moveIn || undefined,
          },
          date || undefined,
        )
      } else {
        return
      }
      if (!r.ok) { toast.error(r.error ?? "Не удалось создать ДС"); return }
      toast.success("ДС создано и отправлено арендатору на подпись")
      reset()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setMode(mode === "extend" ? null : "extend"); setDate("") }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <CalendarPlus className="h-4 w-4" /> Продлить (ДС)
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === "rent" ? null : "rent"); setDate("") }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Coins className="h-4 w-4" /> Изменить условия аренды (ДС)
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === "terminate" ? null : "terminate"); setDate("") }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
        >
          <FileX className="h-4 w-4" /> Расторгнуть (ДС)
        </button>
      </div>

      {mode && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          {mode === "rent" ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Способ расчёта</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRentKind("FIXED")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm ${rentKind === "FIXED" ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>
                    Фикс. сумма ₸/мес
                  </button>
                  <button type="button" onClick={() => setRentKind("RATE")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm ${rentKind === "RATE" ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>
                    Ставка ₸/м²
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {rentKind === "FIXED" ? "Новая сумма аренды ₸/мес" : "Новая ставка ₸/м²"}
                  </label>
                  <input type="number" min={0} step="0.01" className={inputCls} value={rentValue} onChange={(e) => setRentValue(e.target.value)} placeholder="например, 650000" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Уборка ₸/мес (необязательно)</label>
                  <input type="number" min={0} step="0.01" className={inputCls} value={cleaning} onChange={(e) => setCleaning(e.target.value)} placeholder="не менять — оставьте пустым" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Депозит ₸ (необязательно)</label>
                  <input type="number" min={0} step="0.01" className={inputCls} value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="не менять — оставьте пустым" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Каникулы, мес. (необязательно)</label>
                  <input type="number" min={0} max={24} step={1} className={inputCls} value={rentFree} onChange={(e) => setRentFree(e.target.value)} placeholder="не менять — оставьте пустым" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Дата заселения (необязательно)</label>
                  <input type="date" className={inputCls} value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Дата вступления в силу</label>
                <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {mode === "extend" ? "Новая дата окончания договора" : "Дата расторжения"}
              </label>
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
              {mode === "terminate" && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Причина (необязательно)</label>
                  <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="например, по соглашению сторон" />
                </div>
              )}
            </>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Создать и отправить
            </button>
            <button type="button" onClick={reset} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Отмена
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">ДС уйдёт арендатору на подпись; после подписания изменения применятся к договору автоматически.</p>
        </div>
      )}
    </div>
  )
}
