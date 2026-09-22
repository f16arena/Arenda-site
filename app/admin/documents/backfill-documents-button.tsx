"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FilePlus2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { backfillMonthlyDocuments } from "@/app/actions/auto-documents-backfill"
import { useT, useLocale } from "@/lib/i18n/client"
import { formatPeriodL } from "@/lib/i18n/format"

/**
 * «Счета и АВР за месяц»: выбор периода → создать счета и АВР по всем подписанным
 * договорам за этот месяц (напр. закрыть и июнь, и июль). Идемпотентно — уже
 * созданные не дублируются.
 */
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function BackfillDocumentsButton() {
  const router = useRouter()
  const { t } = useT()
  const locale = useLocale()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(currentMonth())

  function run() {
    if (!/^\d{4}-\d{2}$/.test(period)) { toast.error(t("adminDocs.backfill.pickMonth")); return }
    startTransition(async () => {
      const r = await backfillMonthlyDocuments(period)
      if (!r.ok) { toast.error(r.error); return }
      const month = formatPeriodL(locale, r.period)
      if (r.created === 0) {
        toast.info(t("adminDocs.backfill.already", { period: month, tenants: r.tenants }))
      } else {
        toast.success(t("adminDocs.backfill.done", { period: month, count: r.created }))
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        title={t("adminDocs.backfill.buttonTitle")}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
        {pending ? t("adminDocs.backfill.running") : t("adminDocs.backfill.button")}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.backfill.periodLabel")}</label>
            <Input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="mt-1"
            />
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              {t("adminDocs.backfill.hint")}
            </p>
            <Button
              type="button"
              onClick={run}
              disabled={pending}
              className="mt-3 w-full"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
              {pending ? t("adminDocs.backfill.running") : t("adminDocs.backfill.submit")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
