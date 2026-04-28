"use client"

import { useState, useTransition } from "react"
import { Download, Mail, FileText, Receipt, FileCheck, Box } from "lucide-react"
import { toast } from "sonner"
import { sendDocumentToTenant, type DocumentType } from "@/app/actions/send-document"

const DOCS: { type: DocumentType; label: string; icon: typeof FileText; color: string }[] = [
  { type: "INVOICE", label: "Счёт-фактура", icon: Receipt, color: "bg-blue-50 text-blue-700 border-blue-200" },
  { type: "ACT", label: "Акт оказанных услуг", icon: FileCheck, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { type: "CONTRACT", label: "Договор аренды", icon: FileText, color: "bg-slate-50 text-slate-700 border-slate-200" },
  { type: "HANDOVER", label: "Акт приёма-передачи", icon: Box, color: "bg-amber-50 text-amber-700 border-amber-200" },
]

export function DocumentsActions({
  tenantId, tenantHasEmail,
}: {
  tenantId: string
  tenantHasEmail: boolean
}) {
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
      toast.error("У арендатора не указан email")
      return
    }
    setSending(type)
    startTransition(async () => {
      try {
        const r = await sendDocumentToTenant({ tenantId, type, period, number })
        if (r.ok) toast.success("Письмо отправлено")
        else toast.error(r.error ?? "Не удалось отправить")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка")
      } finally {
        setSending(null)
      }
    })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <h2 className="text-sm font-semibold text-slate-900">Документы для арендатора</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {tenantHasEmail ? "Скачать или отправить на email" : "Email не указан — только скачивание"}
        </p>
      </div>
      <div className="divide-y divide-slate-50">
        {DOCS.map((d) => {
          const Icon = d.icon
          return (
            <div key={d.type} className="px-5 py-3 flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${d.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">{d.label}</p>
              </div>
              <a
                href={urlFor(d.type)}
                download
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                title="Скачать DOCX"
              >
                <Download className="h-3.5 w-3.5" />
                DOCX
              </a>
              <button
                onClick={() => handleSend(d.type)}
                disabled={!tenantHasEmail || sending === d.type}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                title={tenantHasEmail ? "Отправить на email" : "Email не указан"}
              >
                <Mail className="h-3.5 w-3.5" />
                {sending === d.type ? "..." : "Email"}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
