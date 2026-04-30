import { Mail, Eye, AlertCircle, Send } from "lucide-react"
import { cn } from "@/lib/utils"

export type EmailLogItem = {
  id: string
  recipient: string
  subject: string
  type: string
  status: string
  externalId: string | null
  error: string | null
  openedAt: Date | null
  openCount: number
  sentAt: Date
}

const TYPE_LABELS: Record<string, string> = {
  INVOICE: "Счёт",
  ACT: "Акт",
  CONTRACT: "Договор",
  HANDOVER: "Акт приёма",
  NOTIFICATION: "Уведомление",
  OTHER: "Прочее",
}

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500",
  SENT: "bg-blue-100 text-blue-700",
  OPENED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
}

const STATUS_LABELS: Record<string, string> = {
  QUEUED: "В очереди",
  SENT: "Отправлено",
  OPENED: "Прочитано",
  FAILED: "Ошибка",
}

export function EmailLog({ items }: { items: EmailLogItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Send className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          История писем ({items.length})
        </h2>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/50">
            <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Тип</th>
            <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Тема</th>
            <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Статус</th>
            <th className="px-4 py-2 text-right font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Отправлено</th>
            <th className="px-4 py-2 text-right font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Прочитано</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id} className="border-b border-slate-50">
              <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{TYPE_LABELS[m.type] ?? m.type}</td>
              <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 dark:text-slate-500 max-w-[300px] truncate">{m.subject}</td>
              <td className="px-4 py-2.5">
                <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium", STATUS_COLORS[m.status] ?? STATUS_COLORS.QUEUED)}>
                  {STATUS_LABELS[m.status] ?? m.status}
                </span>
                {m.error && (
                  <span title={m.error} className="ml-1 inline-flex">
                    <AlertCircle className="h-3 w-3 text-red-500" />
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {new Date(m.sentAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="px-4 py-2.5 text-right">
                {m.openedAt ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <Eye className="h-3 w-3" />
                    {new Date(m.openedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
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
  )
}
