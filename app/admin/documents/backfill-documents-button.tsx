"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { FilePlus2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { backfillMonthlyDocuments } from "@/app/actions/auto-documents-backfill"

/**
 * «Догенерировать за месяц»: счета и АВР по всем подписанным договорам за
 * текущий период. Для договоров, подписанных до включения авто-конвейера.
 * Идемпотентно — повторный клик ничего не дублирует.
 */
export function BackfillDocumentsButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      const r = await backfillMonthlyDocuments()
      if (!r.ok) { toast.error(r.error); return }
      if (r.created === 0) {
        toast.info(`Все счета и АВР за месяц уже созданы (${r.tenants} арендаторов с договорами)`)
      } else {
        toast.success(`Создано документов: ${r.created} — лежат ниже, ждут вашей подписи ЭЦП`)
      }
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title="Создать счета и АВР за текущий месяц по всем подписанным договорам (уже созданные не дублируются)"
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
      {pending ? "Генерация…" : "Счета и АВР за месяц"}
    </button>
  )
}
