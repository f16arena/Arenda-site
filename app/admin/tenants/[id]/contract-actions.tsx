"use client"

import { useState, useTransition } from "react"
import { Send, Copy, Check, FileSignature } from "lucide-react"
import { toast } from "sonner"
import {
  sendContractForSignature,
  markContractSignedByLandlord,
} from "@/app/actions/contract-workflow"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

type Contract = {
  id: string
  number: string
  type?: string
  status: string
  signToken: string | null
  signedByTenantAt: Date | string | null
  signedByLandlordAt: Date | string | null
}

export function ContractWorkflowActions({ contract }: { contract: Contract }) {
  const [pending, startTransition] = useTransition()
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isCompleted = contract.status === "SIGNED" || contract.status === "REJECTED"
  const docName = contract.type === "ADDENDUM" ? "доп. соглашения" : "договора"
  const docNameTitle = contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор"
  const signedToast = contract.type === "ADDENDUM"
    ? "Доп. соглашение подписано со стороны арендодателя"
    : "Договор подписан со стороны арендодателя"

  const send = () => {
    startTransition(async () => {
      const r = await sendContractForSignature(contract.id)
      if (r.ok) {
        setSignUrl(r.signUrl)
        toast.success("Ссылка отправлена арендатору")
      } else {
        toast.error(r.error)
      }
    })
  }

  const isResend = contract.status === "SENT" || contract.status === "VIEWED"

  const markSigned = () => {
    startTransition(async () => {
      const r = await markContractSignedByLandlord(contract.id)
      if (r.ok) toast.success(signedToast)
      else toast.error(r.error)
    })
  }

  const copyUrl = () => {
    if (!signUrl) return
    navigator.clipboard.writeText(signUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isCompleted) {
    return (
      <span className="text-[10px] text-slate-400">
        {contract.status === "SIGNED" ? "✓ Подписан" : "✕ Отклонён"}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {!contract.signedByLandlordAt && (
        <ConfirmDialog
          title={`Подтвердить подпись ${docName} № ${contract.number}?`}
          description="Используйте, если ЭЦП НУЦ РК уже поставлена в файле или подпись ручная. Действие подтверждает подпись со стороны арендодателя."
          confirmLabel="Подтвердить"
          onConfirm={markSigned}
          trigger={
            <button
              disabled={pending}
              title="Отметить подпись арендодателя (после ЭЦП или вручную)"
              className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-800 hover:underline"
            >
              <FileSignature className="h-3 w-3" />
              Я подписал
            </button>
          }
        />
      )}
      {isResend ? (
        <ConfirmDialog
          title={`${docNameTitle} уже отправлялся`}
          description="Сгенерировать новую ссылку? Старая перестанет работать."
          confirmLabel="Сгенерировать"
          onConfirm={send}
          trigger={
            <button
              disabled={pending}
              title="Сгенерировать ссылку и отправить email арендатору"
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
              Переотправить
            </button>
          }
        />
      ) : (
        <button
          onClick={send}
          disabled={pending}
          title="Сгенерировать ссылку и отправить email арендатору"
          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
        >
          <Send className="h-3 w-3" />
          На подпись
        </button>
      )}
      {signUrl && (
        <button
          onClick={copyUrl}
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
          title="Копировать ссылку"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </div>
  )
}
