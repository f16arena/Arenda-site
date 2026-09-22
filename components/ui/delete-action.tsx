"use client"

import { useTransition, ReactNode } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "./confirm-dialog"
import { useT } from "@/lib/i18n/client"

interface DeleteActionProps {
  action: () => Promise<unknown>
  entity?: string
  description?: string
  confirmLabel?: string
  successMessage?: string
  size?: "sm" | "md"
  trigger?: ReactNode
  disabled?: boolean
  onSuccess?: () => void
}

export function DeleteAction({
  action,
  entity,
  description,
  confirmLabel,
  successMessage,
  size = "sm",
  trigger,
  disabled,
  onSuccess,
}: DeleteActionProps) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  // Что удаляем («счёт», «тариф») приходит из словаря вызывающей страницы;
  // если не передали — нейтральное «элемент».
  const what = entity ?? t("common.deleteDialog.entity")

  if (disabled) return null

  const sizeClass = size === "sm" ? "h-3 w-3" : "h-4 w-4"
  const defaultTrigger = (
    <button
      disabled={pending}
      className="text-red-400 hover:text-red-600 dark:text-red-400 disabled:opacity-50 inline-flex items-center"
      aria-label={t("common.deleteDialog.ariaLabel", { entity: what })}
    >
      <Trash2 className={sizeClass} />
    </button>
  )

  return (
    <ConfirmDialog
      title={t("common.deleteDialog.title", { entity: what })}
      description={description ?? t("common.deleteDialog.description")}
      variant="danger"
      confirmLabel={confirmLabel ?? t("common.actions.delete")}
      onConfirm={() =>
        new Promise<void>((resolve) => {
          startTransition(async () => {
            try {
              const result = await action()
              if (isActionError(result)) {
                toast.error(result.error)
                return
              }
              toast.success(successMessage ?? t("common.deleteDialog.success"))
              onSuccess?.()
            } catch (e) {
              toast.error(e instanceof Error ? e.message : t("common.deleteDialog.failed"))
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


function isActionError(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string" &&
    (value as { error: string }).error.length > 0
  )
}
