import { Download } from "lucide-react"
import { RouteTabs } from "@/components/ui/route-tabs"
import { IMPORT_TABS } from "@/lib/hub-tabs"

/**
 * Общая рамка страниц импорта.
 *
 * Раньше на /admin/import была двойная навигация: сверху вкладки, а под ними
 * те же четыре пункта карточками, и к ним ещё ссылка «К импорту» на каждой
 * странице. Осталось одно: вкладки. На самой странице — три шага и одно
 * действие, а описание формата убрано под «Что должно быть в файле».
 */
export function ImportPage({
  title,
  subtitle,
  templateHref,
  templateFileName,
  warning,
  columns,
  children,
}: {
  title: string
  subtitle: string
  /** Ссылка на готовый xlsx-шаблон, если он есть. */
  templateHref?: string
  templateFileName?: string
  /** Одна строка про риск (например: начисления влияют на долг). */
  warning?: string
  /** Что система ждёт в файле — раскрывается по клику. */
  columns?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="max-w-6xl space-y-5">
      <RouteTabs items={IMPORT_TABS} className="mb-2" />

      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>

      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
        <Step n={1}>Выберите файл Excel или CSV</Step>
        <Step n={2}>Проверьте, что система распознала</Step>
        <Step n={3}>Загрузите</Step>
      </ol>

      {warning && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {warning}
        </p>
      )}

      {children}

      <div className="flex flex-wrap items-center gap-3">
        {templateHref && (
          <a
            href={templateHref}
            download={templateFileName}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition active:scale-[0.97] hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4 text-slate-400" />
            Скачать пустой шаблон
          </a>
        )}
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Файл из 1С: «Контрагенты» → Файл → Сохранить как → Excel (xlsx)
        </p>
      </div>

      {columns && (
        <details className="rounded-xl border border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
            Что должно быть в файле
          </summary>
          <div className="space-y-1.5 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
            {columns}
          </div>
        </details>
      )}
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {n}
      </span>
      {children}
    </li>
  )
}
