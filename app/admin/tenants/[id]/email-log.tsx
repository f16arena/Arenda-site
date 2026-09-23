"use client"

import { Eye, AlertCircle, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { useT } from "@/lib/i18n/client"
import { INTL_LOCALE } from "@/lib/i18n/config"

export type EmailLogItem = {
  id: string
  recipient: string
  subject: string
  type: string
  status: string
  externalId: string | null
  error: string | null
  openedAt: Date | string | null
  openCount: number
  sentAt: Date | string
}

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  SENT: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
  OPENED: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  FAILED: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300",
}

// Известные коды — чтобы незнакомый тип из базы показать как есть, а не ключом.
const KNOWN_TYPES = ["INVOICE", "ACT", "CONTRACT", "HANDOVER", "NOTIFICATION", "OTHER"]
const KNOWN_STATUSES = ["QUEUED", "SENT", "OPENED", "FAILED"]

export function EmailLog({ items }: { items: EmailLogItem[] }) {
  const { t, tp, locale } = useT()
  const when = (value: Date | string) =>
    new Date(value).toLocaleString(INTL_LOCALE[locale], {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  if (items.length === 0) return null

  return (
    <CollapsibleCard
      title={t("adminTenants.emailLog.title")}
      icon={Send}
      meta={tp("adminTenants.emailLog.meta", items.length)}
    >
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">{t("adminTenants.emailLog.colType")}</th>
            <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">{t("adminTenants.emailLog.colSubject")}</th>
            <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">{t("adminTenants.emailLog.colStatus")}</th>
            <th className="px-4 py-2 text-right font-medium text-slate-500 dark:text-slate-400">{t("adminTenants.emailLog.colSent")}</th>
            <th className="px-4 py-2 text-right font-medium text-slate-500 dark:text-slate-400">{t("adminTenants.emailLog.colRead")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id} className="border-b border-slate-50">
              <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{KNOWN_TYPES.includes(m.type)
                  ? t(`adminTenants.emailLog.types.${m.type}` as "adminTenants.emailLog.types.OTHER")
                  : m.type}</td>
              <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 max-w-[300px] truncate">{m.subject}</td>
              <td className="px-4 py-2.5">
                <Badge className={cn("px-1.5 text-[10px]", STATUS_COLORS[m.status] ?? STATUS_COLORS.QUEUED)}>
                  {KNOWN_STATUSES.includes(m.status)
                    ? t(`adminTenants.emailLog.statuses.${m.status}` as "adminTenants.emailLog.statuses.SENT")
                    : m.status}
                </Badge>
                {m.error && (
                  <span title={m.error} className="ml-1 inline-flex">
                    <AlertCircle className="h-3 w-3 text-red-500" />
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">
                {when(m.sentAt)}
              </td>
              <td className="px-4 py-2.5 text-right">
                {m.openedAt ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Eye className="h-3 w-3" />
                    {when(m.openedAt)}
                    {m.openCount > 1 && <span className="text-slate-400 dark:text-slate-500">×{m.openCount}</span>}
                  </span>
                ) : m.status === "SENT" ? (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </CollapsibleCard>
  )
}
