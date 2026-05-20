"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCheck } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { resolveAllOpenErrors } from "@/app/actions/superadmin-errors"

export function BulkResolveButton({ openCount }: { openCount: number }) {
  const router = useRouter()
  if (openCount <= 0) return null

  return (
    <ConfirmDialog
      title="Пометить все открытые ошибки решёнными?"
      description={`Будет помечено как «решено»: ${openCount}. Записи не удаляются — только меняется статус. Это удобно, чтобы закрыть исторические/устаревшие ошибки и видеть 0 открытых.`}
      confirmLabel="Пометить решёнными"
      onConfirm={async () => {
        try {
          const { count } = await resolveAllOpenErrors()
          toast.success(`Помечено решёнными: ${count}`)
          router.refresh()
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Не удалось закрыть ошибки")
        }
      }}
      trigger={
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
          <CheckCheck className="h-3.5 w-3.5" />
          Решить все открытые ({openCount})
        </button>
      }
    />
  )
}
