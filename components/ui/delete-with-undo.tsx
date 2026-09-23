"use client"

import { useTransition, ReactNode } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { ConfirmDialog } from "./confirm-dialog"
import { useT } from "@/lib/i18n/client"

type ActionResult = { ok: true } | { ok: false; error: string } | void

interface DeleteWithUndoProps {
  /** Soft-delete действие (server action). Может бросить или вернуть `{ ok: false, error }`. */
  deleteAction: () => Promise<ActionResult>
  /** Восстановление soft-deleted записи. Должно вернуть `{ ok: true }` или `{ ok: false, error }`. */
  restoreAction: () => Promise<{ ok: true } | { ok: false; error: string }>
  /** Подпись в title диалога подтверждения. */
  entity?: string
  description?: string
  confirmLabel?: string
  /** Текст toast после успешного удаления. */
  successMessage?: string
  /** Текст toast после успешного восстановления. */
  restoreMessage?: string
  /** Длительность toast (5–6 сек по UX-практике). */
  duration?: number
  trigger?: ReactNode
  size?: "sm" | "md"
  disabled?: boolean
}

/**
 * Кнопка удаления с undo-toast. Использует sonner `toast.success()` с action.
 * Подходит для soft-deleted сущностей (Charge / Payment) у которых есть restore.
 */
export function DeleteWithUndo({
  deleteAction,
  restoreAction,
  entity,
  description,
  confirmLabel,
  successMessage,
  restoreMessage,
  duration = 6000,
  trigger,
  size = "sm",
  disabled,
}: DeleteWithUndoProps) {
  const { t } = useT()
  const router = useRouter()
  const what = entity ?? t("common.deleteDialog.entity")
  const [pending, startTransition] = useTransition()

  if (disabled) return null

  const sizeClass = size === "sm" ? "h-3 w-3" : "h-4 w-4"
  const defaultTrigger = (
    <button
      type="button"
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
      description={description ?? t("common.undo.description")}
      variant="danger"
      confirmLabel={confirmLabel ?? t("common.actions.delete")}
      onConfirm={() =>
        new Promise<void>((resolve) => {
          startTransition(async () => {
            try {
              const result = await deleteAction()
              if (isActionError(result)) {
                toast.error(result.error)
                return
              }
              router.refresh()
              toast.success(successMessage ?? t("common.undo.deleted", { entity: capitalize(what) }), {
                duration,
                action: {
                  label: t("common.actions.undo"),
                  onClick: async () => {
                    const r = await restoreAction()
                    if (!r.ok) {
                      toast.error(r.error)
                      return
                    }
                    router.refresh()
                    toast.success(restoreMessage ?? t("common.undo.restored"))
                  },
                },
              })
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
