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
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  variant = "default",
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleConfirm() {
    setPending(true)
    try {
      await onConfirm()
      setOpen(false)
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-start gap-4 p-6">
              {variant === "danger" && (
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                {description && (
                  <p className="mt-1 text-sm text-slate-500">{description}</p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending}
                className={`flex-1 rounded-lg py-2 text-sm font-medium text-white disabled:opacity-60 ${
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
