"use client"

import { useState, ReactNode } from "react"
import { AlertTriangle, X } from "lucide-react"

interface ConfirmDialogProps {
  trigger: ReactNode
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "danger"
  /** Если задано — для подтверждения нужно вручную ввести это слово (защита от случайного удаления). */
  requireText?: string
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  variant = "default",
  requireText,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [typed, setTyped] = useState("")

  const textOk = !requireText || typed.trim().toLowerCase() === requireText.trim().toLowerCase()

  function close() {
    setOpen(false)
    setTyped("")
  }

  async function handleConfirm() {
    if (!textOk) return
    setPending(true)
    try {
      await onConfirm()
      close()
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {trigger}
      </span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-start gap-4 p-6">
              {variant === "danger" && (
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                {description && (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
                )}
              </div>
              <button
                onClick={close}
                aria-label="Закрыть"
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {requireText && (
              <div className="px-6 pb-2">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Для подтверждения введите <span className="font-semibold text-slate-700 dark:text-slate-200">«{requireText}»</span>
                </label>
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && textOk && !pending) handleConfirm() }}
                  placeholder={requireText}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>
            )}
            <div className="flex gap-3 px-6 pb-6 pt-2">
              <button
                onClick={close}
                disabled={pending}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending || !textOk}
                className={`flex-1 rounded-lg py-2 text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                  variant === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-slate-900 hover:bg-slate-800"
                }`}
              >
                {pending ? "..." : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
