"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, X, Loader2, Power } from "lucide-react"
import { activateAddon, deactivateAddon } from "@/app/actions/superadmin-addons"

export function ActivateButton({ addonId }: { addonId: string }) {
  const [open, setOpen] = useState(false)
  const [expiresAt, setExpiresAt] = useState("")
  const [pending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const r = await activateAddon({ addonId, expiresAt: expiresAt || null })
      if (r.ok) {
        toast.success("Аддон активирован, клиент уведомлён")
        setOpen(false)
      } else {
        toast.error(r.error ?? "Не удалось")
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
      >
        <CheckCircle2 className="h-3 w-3" />
        Активировать
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-1.5">
      <input
        type="date"
        value={expiresAt}
        onChange={(e) => setExpiresAt(e.target.value)}
        title="Срок действия (опционально)"
        className="rounded border border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-xs text-slate-900 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={confirm}
        disabled={pending}
        className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded px-1 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        ✕
      </button>
    </div>
  )
}

export function RejectButton({ addonId }: { addonId: string }) {
  const [pending, startTransition] = useTransition()
  function onClick() {
    const reason = prompt("Причина отказа (необязательно):", "")
    if (reason === null) return
    startTransition(async () => {
      const r = await deactivateAddon({ addonId, reject: true, reason: reason || undefined })
      if (r.ok) toast.success("Заявка отклонена")
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
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
      Отклонить
    </button>
  )
}

export function DeactivateButton({ addonId }: { addonId: string }) {
  const [pending, startTransition] = useTransition()
  function onClick() {
    const reason = prompt("Причина деактивации (необязательно):", "")
    if (reason === null) return
    startTransition(async () => {
      const r = await deactivateAddon({ addonId, reason: reason || undefined })
      if (r.ok) toast.success("Аддон деактивирован")
      else toast.error(r.error ?? "Не удалось")
    })
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
      Выключить
    </button>
  )
}
