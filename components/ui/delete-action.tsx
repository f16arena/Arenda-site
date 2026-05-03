"use client"

import { useTransition, ReactNode } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "./confirm-dialog"

interface DeleteActionProps {
  action: () => Promise<unknown>
  entity?: string
  description?: string
  confirmLabel?: string
  successMessage?: string
  size?: "sm" | "md"
  trigger?: ReactNode
  disabled?: boolean
}

export function DeleteAction({
  action,
  entity = "элемент",
  description,
  confirmLabel = "Удалить",
  successMessage,
  size = "sm",
  trigger,
  disabled,
}: DeleteActionProps) {
  const [pending, startTransition] = useTransition()

  if (disabled) return null

  const sizeClass = size === "sm" ? "h-3 w-3" : "h-4 w-4"
  const defaultTrigger = (
    <button
      disabled={pending}
      className="text-red-400 hover:text-red-600 dark:text-red-400 disabled:opacity-50 inline-flex items-center"
      aria-label={`Удалить ${entity}`}
    >
      <Trash2 className={sizeClass} />
    </button>
  )

  return (
    <ConfirmDialog
      title={`Удалить ${entity}?`}
      description={description ?? "Это действие нельзя отменить."}
      variant="danger"
      confirmLabel={confirmLabel}
      onConfirm={() =>
        new Promise<void>((resolve) => {
          startTransition(async () => {
            try {
              const result = await action()
              if (isActionError(result)) {
                toast.error(result.error)
                return
              }
              toast.success(successMessage ?? `${capitalize(entity)} удалён`)
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Не удалось удалить")
            } finally {
              resolve()
            }
          })
        })
      }
      trigger={trigger ?? defaultTrigger}
    />
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function isActionError(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string" &&
    (value as { error: string }).error.length > 0
  )
}
