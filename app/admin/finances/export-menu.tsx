import { ChevronDown, Download, Upload } from "lucide-react"

// Выгрузки и импорт — одним меню вместо четырёх цветных кнопок в шапке.
// <details> работает без JS и закрывается повторным нажатием.
export function ExportMenu({
  period,
  canZip,
  can1c,
  canExcel,
  canImport,
}: {
  period: string
  canZip: boolean
  can1c: boolean
  canExcel: boolean
  canImport: boolean
}) {
  if (!canZip && !can1c && !canExcel && !canImport) return null
  const item = "flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
        <Download className="h-4 w-4" />
        Выгрузить
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {canZip && (
          <a href={`/api/export/documents-zip?period=${period}`} download className={item}>
            <Download className="h-4 w-4 text-slate-400" /> Счета и АВР за месяц (ZIP)
          </a>
        )}
        {canExcel && (
          <a href="/api/export/finances" download className={item}>
            <Download className="h-4 w-4 text-slate-400" /> Все финансы в Excel
          </a>
        )}
        {can1c && (
          <a href="/api/export/1c" download className={item}>
            <Download className="h-4 w-4 text-slate-400" /> Для бухгалтерии (1С)
          </a>
        )}
        {canImport && (
          <a href="/admin/finances/import" className={`${item} border-t border-slate-100 dark:border-slate-800`}>
            <Upload className="h-4 w-4 text-slate-400" /> Загрузить выписку банка
          </a>
        )}
      </div>
    </details>
  )
}
