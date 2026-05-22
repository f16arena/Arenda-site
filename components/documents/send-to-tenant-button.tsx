"use client"

import { useState, useTransition } from "react"
import { Send, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { sendDocumentToTenant, type DocumentType } from "@/app/actions/send-document"

/**
 * «Отправить арендатору»: генерирует документ, кладёт его в кабинет арендатора
 * и шлёт ему уведомление (in-app + email, если есть почта).
 */
export function SendToTenantButton({
  tenantId,
  type,
  period,
  number,
  from,
  to,
  className,
}: {
  tenantId: string
  type: DocumentType
  period?: string
  number?: string
  from?: string
  to?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)

  function send() {
    startTransition(async () => {
      try {
        const r = await sendDocumentToTenant({ tenantId, type, period, number, from, to })
        if (r.ok) {
          setSent(true)
          toast.success("Отправлено арендатору — уведомление пришло в его кабинет")
        } else {
          toast.error(r.error ?? "Не удалось отправить")
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка")
      }
    })
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={pending}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      {sent ? "Отправлено" : "Отправить арендатору"}
    </button>
  )
}
