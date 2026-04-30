export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowLeft, Download, Info } from "lucide-react"
import { ImportTenantsClient } from "./import-client"

export default function ImportTenantsPage() {
  return (
    <div className="space-y-5 max-w-4xl">
      <Link href="/admin/import" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> К импорту
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Импорт арендаторов</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
          Загрузите Excel или CSV со списком арендаторов. Поддерживаются файлы из 1С (предварительно сохранённые в xlsx).
        </p>
      </div>

      {/* Шаблон */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-900 mb-1">Не знаете формат?</p>
            <p className="text-sm text-blue-800 mb-3">
              Скачайте наш шаблон со всеми колонками и примерами — заполните и загрузите обратно.
            </p>
            <a
              href="/api/import/tenants/template"
              download="commrent-tenants-template.xlsx"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Скачать шаблон Excel
            </a>
          </div>
        </div>
      </div>

      <ImportTenantsClient />

      {/* FAQ */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 text-sm text-slate-700 dark:text-slate-300 space-y-3">
        <p className="font-semibold text-slate-900 dark:text-slate-100">Что распознаёт система</p>
        <ul className="space-y-1.5 list-disc list-inside text-slate-600 dark:text-slate-400 dark:text-slate-500">
          <li><b>Название колонок</b> — синонимы: «Название» = «Контрагент» = «Компания» = «Организация»</li>
          <li><b>Тип организации</b> — ИП / ТОО / АО / ФЛ; если не указано — по умолчанию ТОО</li>
          <li><b>БИН/ИИН</b> — извлекается 12 цифр из любого формата (с пробелами, дефисами и пр.)</li>
          <li><b>Телефон</b> — нормализуется к виду +7XXXXXXXXXX</li>
          <li><b>Дата</b> — поддерживается ДД.ММ.ГГГГ, ГГГГ-ММ-ДД, ДД/ММ/ГГГГ и Excel serial date</li>
          <li><b>№ помещения</b> — если совпадает с существующим в здании, арендатор привяжется автоматически</li>
        </ul>
      </div>
    </div>
  )
}
