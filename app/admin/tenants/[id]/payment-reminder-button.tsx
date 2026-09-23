"use client"

import { useState, useTransition } from "react"
import { BellRing, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { remindTenantPayment } from "@/app/actions/payment-reminder"
import { useT } from "@/lib/i18n/client"

/** Кнопка «Напомнить об оплате» на карточке арендатора (видна при долге). */
export function PaymentReminderButton({ tenantId }: { tenantId: string }) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)

  function send() {
    startTransition(async () => {
      const r = await remindTenantPayment(tenantId)
      if (!r.ok) { toast.error(r.error); return }
      setSent(true)
      toast.success(t("adminTenants.reminder.sent"))
    })
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={pending || sent}
      title={t("adminTenants.reminder.hint")}
      className="flex items-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
      {sent ? t("adminTenants.reminder.sentShort") : t("adminTenants.reminder.button")}
    </button>
  )
}
