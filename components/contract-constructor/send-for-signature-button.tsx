"use client"

import { useState, useTransition } from "react"
import { Send, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { sendContractForSignature } from "@/app/actions/contract-workflow"
import { useT } from "@/lib/i18n/client"

/** Отправить договор/ДС арендатору на подпись: создаёт ссылку, шлёт письмо+уведомление. */
export function SendForSignatureButton({ contractId, alreadySent }: { contractId: string; alreadySent?: boolean }) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const send = () =>
    startTransition(async () => {
      const r = await sendContractForSignature(contractId)
      if (r.ok) {
        setSignUrl(r.signUrl)
        toast.success(t("adminDocs.constructor.send.sent"))
      } else {
        toast.error(r.error)
      }
    })

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Send className="h-4 w-4" />
        {pending
          ? t("adminDocs.constructor.send.sending")
          : alreadySent
            ? t("adminDocs.constructor.send.resend")
            : t("adminDocs.constructor.send.send")}
      </button>
      {signUrl && (
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(signUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 hover:underline dark:text-blue-400"
          title={signUrl}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? t("adminDocs.constructor.send.copied") : t("adminDocs.constructor.send.copy")}
        </button>
      )}
    </div>
  )
}
