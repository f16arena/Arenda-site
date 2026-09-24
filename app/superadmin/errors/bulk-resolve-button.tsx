"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCheck } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { resolveAllOpenErrors } from "@/app/actions/superadmin-errors"
import { useT } from "@/lib/i18n/client"

export function BulkResolveButton({ openCount }: { openCount: number }) {
  const router = useRouter()
  const { t } = useT()
  if (openCount <= 0) return null

  return (
    <ConfirmDialog
      title={t("superadmin.errors.bulkTitle")}
      description={t("superadmin.errors.bulkDescription", { count: openCount })}
      confirmLabel={t("superadmin.errors.bulkConfirm")}
      onConfirm={async () => {
        try {
          const { count } = await resolveAllOpenErrors()
          toast.success(t("superadmin.errors.bulkDone", { count }))
          router.refresh()
        } catch (e) {
          toast.error(e instanceof Error ? e.message : t("superadmin.errors.bulkFailed"))
        }
      }}
      trigger={
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
          <CheckCheck className="h-3.5 w-3.5" />
          {t("superadmin.errors.bulkButton", { count: openCount })}
        </button>
      }
    />
  )
}
