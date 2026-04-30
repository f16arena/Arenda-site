import { db } from "@/lib/db"
import { Download, FileText } from "lucide-react"
import { formatMoney } from "@/lib/utils"

interface Props {
  organizationId: string
  documentType: "CONTRACT" | "INVOICE" | "ACT" | "RECONCILIATION" | "HANDOVER"
  period?: string  // фильтр YYYY-MM (опционально)
}

/**
 * Список ранее сгенерированных документов для текущего типа.
 * Опциональная фильтрация по периоду.
 */
export async function DocumentArchive({ organizationId, documentType, period }: Props) {
  const docs = await db.generatedDocument.findMany({
    where: {
      organizationId,
      documentType,
      ...(period ? { period } : {}),
    },
    orderBy: { generatedAt: "desc" },
    take: 50,
    select: {
      id: true, number: true, tenantName: true, period: true,
      totalAmount: true, fileName: true, fileSize: true, format: true,
      generatedAt: true,
    },
  }).catch(() => [])

  if (docs.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center print:hidden">
        <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Архив пуст{period ? " за выбранный период" : ""}.
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Сгенерированные документы будут появляться здесь.</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden print:hidden">
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Архив (последние {docs.length})
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <th className="px-4 py-2 text-left text-[10px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest">№</th>
            <th className="px-4 py-2 text-left text-[10px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest">Контрагент</th>
            <th className="px-4 py-2 text-left text-[10px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest">Период</th>
            <th className="px-4 py-2 text-right text-[10px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest">Сумма</th>
            <th className="px-4 py-2 text-left text-[10px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest">Дата</th>
            <th className="px-4 py-2 text-right" />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-t border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50/50">
              <td className="px-4 py-2 font-mono text-xs">{d.number ?? "—"}</td>
              <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{d.tenantName}</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">{d.period ?? "—"}</td>
              <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300 font-medium">
                {d.totalAmount ? formatMoney(d.totalAmount) : "—"}
              </td>
              <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {new Date(d.generatedAt).toLocaleDateString("ru-RU")}
              </td>
              <td className="px-4 py-2 text-right">
                <a
                  href={`/api/documents/archive/${d.id}`}
                  download={d.fileName}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  <Download className="h-3 w-3" />
                  Скачать
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
