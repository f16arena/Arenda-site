"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, FileBadge, XCircle, Loader2 } from "lucide-react"
import { markServicePaid, markServiceDelivered, cancelService } from "@/app/actions/services"

export function MarkPaidButton({ serviceId }: { serviceId: string }) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState("")
  const [pending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const r = await markServicePaid({ serviceId, paymentMethod: method || undefined })
      if (r.ok) { toast.success("Услуга помечена как оплаченная, клиент уведомлён"); setOpen(false) }
      else toast.error(r.error ?? "Не удалось")
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20"
      >
        <CheckCircle2 className="h-3 w-3" />
        Оплачено
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-1.5">
      <input
        value={method}
        onChange={(e) => setMethod(e.target.value)}
        placeholder="метод (Kaspi/нал./р/с)"
        className="w-32 rounded border border-blue-200 dark:border-blue-500/30 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-xs text-slate-900 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={confirm}
        disabled={pending}
        className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded px-1 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
    </div>
  )
}

export function MarkDeliveredButton({ serviceId }: { serviceId: string }) {
  const [pending, startTransition] = useTransition()
  function onClick() {
    if (!confirm("Подтвердить, что услуга выполнена?")) return
    startTransition(async () => {
      const r = await markServiceDelivered({ serviceId })
      if (r.ok) toast.success("Услуга помечена как выполненная")
      else toast.error(r.error ?? "Не удалось")
    })
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileBadge className="h-3 w-3" />}
      Выполнено
    </button>
  )
}

export function CancelButton({ serviceId }: { serviceId: string }) {
  const [pending, startTransition] = useTransition()
  function onClick() {
    const reason = prompt("Причина отмены (необязательно):", "")
    if (reason === null) return
    startTransition(async () => {
      const r = await cancelService({ serviceId, reason: reason || undefined })
      if (r.ok) toast.success("Услуга отменена")
      else toast.error(r.error ?? "Не удалось")
    })
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
      Отменить
    </button>
  )
}
