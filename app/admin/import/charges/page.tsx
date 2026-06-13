export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowLeft, Info } from "lucide-react"
import { ImportChargesClient } from "./import-client"

export default function ImportChargesPage() {
  return (
    <div className="space-y-5 max-w-4xl">
      <Link href="/admin/import" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> К импорту
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Импорт истории начислений</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Перенос начислений за прошлые месяцы из 1С/Excel. Влияет на расчёт долга — проверяйте превью.
        </p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 text-sm text-amber-900 dark:text-amber-200">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold mb-1">Колонки и важное</p>
            <ul className="space-y-0.5 list-disc list-inside text-amber-800 dark:text-amber-200">
              <li><b>Арендатор</b> — БИН/ИИН (точнее) или название; должен уже существовать</li>
              <li><b>Период</b> (обяз.) — ГГГГ-ММ, ММ.ГГГГ или дата</li>
              <li><b>Сумма</b> (обяз.) — положительное число</li>
              <li><b>Тип</b> — аренда/электр./вода/отопление/уборка… (по умолчанию «Аренда»)</li>
              <li><b>Оплачено</b> — «да/оплачено» → не попадёт в долг; иначе увеличит долг</li>
            </ul>
            <p className="mt-2 text-xs font-medium">⚠ Неоплаченные начисления увеличивают долг арендатора. Дубли по «арендатор+период+тип» пропускаются.</p>
          </div>
        </div>
      </div>

      <ImportChargesClient />
    </div>
  )
}
