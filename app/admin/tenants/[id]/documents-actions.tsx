"use client"

import { useState, useTransition } from "react"
import { Download, Mail, FileText, Receipt, FileCheck, Box } from "lucide-react"
import { toast } from "sonner"
import { sendDocumentToTenant, type DocumentType } from "@/app/actions/send-document"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/client"

// Подписи видов документов берём из словаря по коду (docActions.types).
const DOCS: { type: DocumentType; icon: typeof FileText; color: string }[] = [
  { type: "INVOICE", icon: Receipt, color: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30" },
  { type: "ACT", icon: FileCheck, color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30" },
  { type: "CONTRACT", icon: FileText, color: "bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800" },
  { type: "HANDOVER", icon: Box, color: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30" },
]

export function DocumentsActions({
  tenantId, tenantHasEmail,
}: {
  tenantId: string
  tenantHasEmail: boolean
}) {
  const { t } = useT()
  const period = new Date().toISOString().slice(0, 7)
  const number = `${period.replace("-", "")}-001`
  const [, startTransition] = useTransition()
  const [sending, setSending] = useState<DocumentType | null>(null)

  function urlFor(type: DocumentType): string {
    if (type === "INVOICE") return `/api/invoices/generate?tenantId=${tenantId}&period=${period}&number=${number}`
    if (type === "ACT") return `/api/acts/generate?tenantId=${tenantId}&period=${period}&number=${number}`
    if (type === "CONTRACT") return `/api/contracts/generate?tenantId=${tenantId}&number=${number}`
    if (type === "HANDOVER") return `/api/handover/generate?tenantId=${tenantId}&direction=in`
    return "#"
  }

  function handleSend(type: DocumentType) {
    if (!tenantHasEmail) {
      toast.error(t("adminTenants.docActions.noEmail"))
      return
    }
    setSending(type)
    startTransition(async () => {
      try {
        const r = await sendDocumentToTenant({ tenantId, type, period, number })
        if (r.ok) toast.success(t("adminTenants.docActions.sent"))
        else toast.error(r.error ?? t("adminTenants.docActions.failed"))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminTenants.docActions.error"))
      } finally {
        setSending(null)
      }
    })
  }

  return (
    <CollapsibleCard
      title={t("adminTenants.docActions.title")}
      icon={FileText}
      meta={tenantHasEmail ? t("adminTenants.docActions.metaReady") : t("adminTenants.docActions.metaNoEmail")}>
      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {DOCS.map((d) => {
          const Icon = d.icon
          return (
            <div key={d.type} className="px-5 py-3 flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${d.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t(`domain.docTypes.${d.type}`)}</p>
              </div>
              <a
                href={urlFor(d.type)}
                download
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                title={t("adminTenants.docActions.downloadHint")}
              >
                <Download className="h-3.5 w-3.5" />
                DOCX
              </a>
              <Button
                size="sm"
                onClick={() => handleSend(d.type)}
                disabled={!tenantHasEmail || sending === d.type}
                title={tenantHasEmail ? t("adminTenants.docActions.sendHint") : t("adminTenants.docActions.sendDisabled")}
              >
                <Mail className="h-3.5 w-3.5" />
                {sending === d.type ? "..." : "Email"}
              </Button>
            </div>
          )
        })}
      </div>
    </CollapsibleCard>
  )
}
