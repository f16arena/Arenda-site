"use client"

// Оболочка модального окна: затемнение, центрирование, Esc и клик мимо —
// закрыть, фокус остаётся внутри окна. Заменяет ~20 самодельных
// «fixed inset-0 bg-black/40» окон (без Esc, без фокуса, разное затемнение).
// Содержимое (шапка, форма, кнопки) — как было, className — стиль панели.

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n/client"

export function ModalShell({
  open,
  onClose,
  className,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  className?: string
  /** Для экранных дикторов; видимый заголовок — внутри children */
  title?: string
  children: React.ReactNode
}) {
  const { t } = useT()
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 outline-none"
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <DialogPrimitive.Title className="sr-only">{title ?? t("common.dialog.windowTitle")}</DialogPrimitive.Title>
          <div className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", className)}>{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
