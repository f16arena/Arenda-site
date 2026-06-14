"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, AlertTriangle, X } from "lucide-react"
import { respondToReconciliation } from "@/app/actions/reconciliation-response"

export function ReconciliationResponse({
  documentId,
  status,
  note,
}: {
  documentId: string
  status: string | null
  note: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showDispute, setShowDispute] = useState(false)
  const [disputeNote, setDisputeNote] = useState("")
  const [error, setError] = useState<string | null>(null)

  if (status === "AGREED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" /> Сверка подтверждена
      </span>
    )
  }

  if (status === "DISPUTED") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
        title={note ?? undefined}
      >
        <AlertTriangle className="h-3.5 w-3.5" /> Заявлено расхождение
      </span>
    )
  }

  // status === "SENT" (или null для старых актов) — даём подтвердить/оспорить
  function submit(agree: boolean) {
    startTransition(async () => {
      setError(null)
      const r = await respondToReconciliation(documentId, agree, agree ? undefined : disputeNote)
      if ("error" in r) {
        setError(r.error)
        return
      }
      setShowDispute(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Подтвердить сверку
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setShowDispute((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Есть расхождение
        </button>
      </div>

      {showDispute && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-amber-800 dark:text-amber-300">Опишите расхождение</label>
            <button type="button" onClick={() => setShowDispute(false)} aria-label="Закрыть" title="Закрыть">
              <X className="h-3.5 w-3.5 text-amber-500" />
            </button>
          </div>
          <textarea
            value={disputeNote}
            onChange={(e) => setDisputeNote(e.target.value)}
            rows={3}
            placeholder="Например: не учтена оплата от 5 числа на 120 000 ₸"
            className="w-full rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={pending || !disputeNote.trim()}
            onClick={() => submit(false)}
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {pending ? "Отправка…" : "Отправить расхождение"}
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
