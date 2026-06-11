"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Landmark, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { sendActToEsf, refreshEsfStatus } from "@/app/actions/esf"

/**
 * Управление отправкой АВР в ИС ЭСФ (КГД): кнопка отправки, статус-бейдж,
 * обновление статуса (подтвердил ли арендатор в своём кабинете ЭСФ).
 */

const STATUS_LABEL: Record<string, string> = {
  SENT: "в ЭСФ: отправлен",
  CREATED: "в ЭСФ: создан",
  DELIVERED: "в ЭСФ: доставлен",
  CONFIRMED: "в ЭСФ: подтверждён",
  DECLINED: "в ЭСФ: отклонён",
  CANCELED: "в ЭСФ: отозван",
  FAILED: "ЭСФ: ошибка",
}

function statusTone(status: string): string {
  if (status === "CONFIRMED") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
  if (status === "DECLINED" || status === "FAILED" || status === "CANCELED") return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
}

export function EsfControl({
  documentId,
  status,
  regNumber,
  error,
}: {
  documentId: string
  status: string | null
  regNumber: string | null
  error?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function send() {
    startTransition(async () => {
      const r = await sendActToEsf(documentId)
      if (!r.ok) { toast.error(r.error); router.refresh(); return }
      toast.success(`АВР отправлен в ИС ЭСФ${r.regNumber ? ` · ${r.regNumber}` : ""} — арендатор подтвердит его в своём кабинете ЭСФ`)
      router.refresh()
    })
  }

  function refresh() {
    startTransition(async () => {
      const r = await refreshEsfStatus(documentId)
      if (!r.ok) { toast.error(r.error); return }
      toast.success(`Статус в ИС ЭСФ: ${STATUS_LABEL[r.status ?? ""] ?? r.status ?? "без изменений"}`)
      router.refresh()
    })
  }

  // Ещё не отправлялся (или упал/отклонён — можно отправить заново)
  if (!status || status === "FAILED" || status === "DECLINED") {
    return (
      <span className="inline-flex items-center gap-1">
        {status && (
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-1 text-[10px] font-medium ${statusTone(status)}`}
            title={error ?? undefined}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
        )}
        <button
          type="button"
          onClick={send}
          disabled={pending}
          title="Отправить электронный АВР в ИС ЭСФ (КГД) — арендатор подтвердит его ЭЦП в своём кабинете"
          className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Landmark className="h-3 w-3" />}
          {status ? "Повторить в ЭСФ" : "В ЭСФ"}
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center rounded-md border px-1.5 py-1 text-[10px] font-medium ${statusTone(status)}`}
        title={regNumber ? `Рег. номер: ${regNumber}` : undefined}
      >
        {STATUS_LABEL[status] ?? `в ЭСФ: ${status}`}
      </span>
      {status !== "CONFIRMED" && (
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          title="Обновить статус из ИС ЭСФ"
          aria-label="Обновить статус из ИС ЭСФ"
          className="inline-flex items-center rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      )}
    </span>
  )
}
