"use client"

import { FileText, Download, ShieldCheck } from "lucide-react"
import { DocumentSignButton } from "@/components/cabinet/document-sign-button"

export type PaymentDoc = {
  id: string
  type: string
  number: string | null
  period: string | null
  signedByTenant: boolean
}

const TYPE_LABEL: Record<string, string> = {
  INVOICE: "Счёт на оплату",
  ACT: "Акт выполненных работ",
}

/** Документы к оплате (счёт/АВР) прямо у панели оплаты: скачать → подписать ЭЦП → оплатить. */
export function PaymentDocuments({ docs }: { docs: PaymentDoc[] }) {
  if (docs.length === 0) return null
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/50">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Документы к оплате</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Счёт и акт по вашей аренде. Скачайте, при необходимости подпишите ЭЦП — и оплатите ниже.
        </p>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {docs.map((d) => (
          <div key={d.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {TYPE_LABEL[d.type] ?? d.type}{d.number ? ` № ${d.number}` : ""}
                </p>
                {d.period && <p className="text-xs text-slate-400 dark:text-slate-500">Период {d.period}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {d.signedByTenant ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" /> вы подписали
                </span>
              ) : (
                <DocumentSignButton documentId={d.id} />
              )}
              <a
                href={`/api/documents/archive/${d.id}?format=pdf`}
                download
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" /> Скачать
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
