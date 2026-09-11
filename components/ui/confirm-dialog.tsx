"use client"

import { useState, ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Пока идёт подтверждение — Esc и клик мимо не закрывают окно.
          if (pending) return
          if (next) setOpen(true)
          else close()
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-start gap-4">
              {variant === "danger" && (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <DialogTitle>{title}</DialogTitle>
                {description && <DialogDescription>{description}</DialogDescription>}
              </div>
            </div>
          </DialogHeader>

          {requireText && (
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                Для подтверждения введите{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">«{requireText}»</span>
              </label>
              <Input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && textOk && !pending) handleConfirm()
                }}
                placeholder={requireText}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={pending} className="flex-1">
              {cancelLabel}
            </Button>
            <Button
              variant={variant === "danger" ? "danger" : "primary"}
              onClick={handleConfirm}
              disabled={!textOk}
              loading={pending}
              className="flex-1 font-medium"
            >
              {pending ? "..." : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
