"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CalendarPlus, FileX, Loader2 } from "lucide-react"
import { createExtensionAddendum, createTerminationAddendum } from "@/app/actions/contract-addendums"

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"

/** ДС к подписанному договору: продление срока или расторжение (создаёт ADDENDUM + отправляет арендатору). */
export function AddendumActions({ contractId }: { contractId: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<null | "extend" | "terminate">(null)
  const [date, setDate] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!date) { toast.error("Укажите дату"); return }
    setBusy(true)
    try {
      const r = mode === "extend"
        ? await createExtensionAddendum(contractId, date)
        : await createTerminationAddendum(contractId, date, reason.trim() || undefined)
      if (!r.ok) { toast.error(r.error ?? "Не удалось создать ДС"); return }
      toast.success(mode === "extend"
        ? "ДС о продлении создано и отправлено арендатору на подпись"
        : "Соглашение о расторжении создано и отправлено арендатору на подпись")
      setMode(null); setDate(""); setReason("")
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
          onClick={() => { setMode(mode === "terminate" ? null : "terminate"); setDate("") }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
        >
          <FileX className="h-4 w-4" /> Расторгнуть (ДС)
        </button>
      </div>

      {mode && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
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
            <button type="button" onClick={() => setMode(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Отмена
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">ДС уйдёт арендатору на подпись; после подписания изменения применятся к договору автоматически.</p>
        </div>
      )}
    </div>
  )
}
