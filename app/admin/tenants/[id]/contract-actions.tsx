"use client"

import { useState, useTransition } from "react"
import { Send, Copy, Check, FileSignature } from "lucide-react"
import { toast } from "sonner"
import {
  sendContractForSignature,
  markContractSignedByLandlord,
} from "@/app/actions/contract-workflow"

type Contract = {
  id: string
  number: string
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

  const send = () => {
    if (contract.status === "SENT" || contract.status === "VIEWED") {
      if (!window.confirm("Договор уже отправлялся. Сгенерировать новую ссылку (старая перестанет работать)?")) return
    }
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

  const markSigned = () => {
    if (!window.confirm(`Подтвердите подпись договора № ${contract.number} со стороны арендодателя.\n\n` +
      `Используйте если ЭЦП НУЦ РК уже поставлена в файле или подпись ручная.`)) return
    startTransition(async () => {
      const r = await markContractSignedByLandlord(contract.id)
      if (r.ok) toast.success("Договор подписан со стороны арендодателя")
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
        <button
          onClick={markSigned}
          disabled={pending}
          title="Отметить подпись арендодателя (после ЭЦП или вручную)"
          className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-800 hover:underline"
        >
          <FileSignature className="h-3 w-3" />
          Я подписал
        </button>
      )}
      <button
        onClick={send}
        disabled={pending}
        title="Сгенерировать ссылку и отправить email арендатору"
        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
      >
        <Send className="h-3 w-3" />
        {contract.status === "SENT" || contract.status === "VIEWED" ? "Переотправить" : "На подпись"}
      </button>
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
