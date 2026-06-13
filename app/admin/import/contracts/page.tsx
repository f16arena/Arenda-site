export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowLeft, Info } from "lucide-react"
import { ImportContractsClient } from "./import-client"

export default function ImportContractsPage() {
  return (
    <div className="space-y-5 max-w-4xl">
      <Link href="/admin/import" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> К импорту
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Импорт договоров</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Реестр договоров из Excel/CSV. Арендатор сопоставляется по БИН/ИИН или названию компании.
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4 text-sm text-blue-900 dark:text-blue-200">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold mb-1">Какие колонки нужны</p>
            <ul className="space-y-0.5 list-disc list-inside text-blue-800 dark:text-blue-200">
              <li><b>Номер договора</b> (обяз.) — «Номер», «№», «Договор»</li>
              <li><b>Арендатор</b> — «БИН/ИИН» (точнее) или «Название/Контрагент»; должен уже существовать в системе</li>
              <li><b>Даты</b> — «Дата начала», «Дата окончания» (ДД.ММ.ГГГГ / ГГГГ-ММ-ДД)</li>
              <li><b>Статус</b> — подписан/черновик/истёк/расторгнут (по умолчанию «Подписан»)</li>
            </ul>
            <p className="mt-2 text-xs">Сначала импортируйте арендаторов, затем договоры. Дубли по номеру у того же арендатора пропускаются.</p>
          </div>
        </div>
      </div>

      <ImportContractsClient />
    </div>
  )
}
