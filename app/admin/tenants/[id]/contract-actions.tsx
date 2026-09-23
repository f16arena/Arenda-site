"use client"

import { useState, useTransition } from "react"
import { Send, Copy, Check, FileSignature } from "lucide-react"
import { toast } from "sonner"
import {
  sendContractForSignature,
  markContractSignedByLandlord,
} from "@/app/actions/contract-workflow"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useT } from "@/lib/i18n/client"

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
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isCompleted = contract.status === "SIGNED" || contract.status === "REJECTED"
  const isAddendum = contract.type === "ADDENDUM"
  const docName = isAddendum
    ? t("adminTenants.contracts.docGenitive.addendum")
    : t("adminTenants.contracts.docGenitive.contract")
  const docNameTitle = isAddendum
    ? t("adminTenants.contracts.addendum")
    : t("adminTenants.contracts.contract")
  const signedToast = isAddendum
    ? t("adminTenants.contracts.addendumSignedByLandlord")
    : t("adminTenants.contracts.signedByLandlord")

  const send = () => {
    startTransition(async () => {
      const r = await sendContractForSignature(contract.id)
      if (r.ok) {
        setSignUrl(r.signUrl)
        toast.success(t("adminTenants.contracts.linkSent"))
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
        {contract.status === "SIGNED"
          ? t("adminTenants.contracts.signedShort")
          : t("adminTenants.contracts.rejectedShort")}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {!contract.signedByLandlordAt && (
        <ConfirmDialog
          title={t("adminTenants.contracts.confirmSignTitle", { doc: docName, number: contract.number })}
          description={t("adminTenants.contracts.confirmSignText")}
          confirmLabel={t("adminTenants.contracts.confirmSignLabel")}
          onConfirm={markSigned}
          trigger={
            <button
              disabled={pending}
              title={t("adminTenants.contracts.iSignedHint")}
              className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-800 hover:underline"
            >
              <FileSignature className="h-3 w-3" />
              {t("adminTenants.contracts.iSigned")}
            </button>
          }
        />
      )}
      {isResend ? (
        <ConfirmDialog
          title={t("adminTenants.contracts.resendTitle", { doc: docNameTitle })}
          description={t("adminTenants.contracts.resendText")}
          confirmLabel={t("adminTenants.contracts.resendLabel")}
          onConfirm={send}
          trigger={
            <button
              disabled={pending}
              title={t("adminTenants.contracts.sendHint")}
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
              {t("adminTenants.contracts.resend")}
            </button>
          }
        />
      ) : (
        <button
          onClick={send}
          disabled={pending}
          title={t("adminTenants.contracts.sendHint")}
          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
        >
          <Send className="h-3 w-3" />
          {t("adminTenants.contracts.send")}
        </button>
      )}
      {signUrl && (
        <button
          onClick={copyUrl}
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
          title={t("adminTenants.contracts.copyLink")}
        >
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </div>
  )
}
