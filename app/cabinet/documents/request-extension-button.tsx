"use client"

import { useState, useTransition } from "react"
import { CalendarPlus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { requestContractExtension } from "@/app/actions/contract-extension-request"

/** Кнопка «Запросить продление» у подписанного договора с близким сроком окончания. */
export function RequestExtensionButton({ contractId }: { contractId: string }) {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)

  function send() {
    startTransition(async () => {
      const r = await requestContractExtension(contractId)
      if (!r.ok) { toast.error(r.error); return }
      setSent(true)
      toast.success("Запрос отправлен арендодателю — с вами свяжутся")
    })
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={pending || sent}
      title="Сообщить арендодателю, что вы хотите продлить договор"
      className="flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
      {sent ? "Запрошено" : "Запросить продление"}
    </button>
  )
}
