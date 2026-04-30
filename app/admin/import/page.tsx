export const dynamic = "force-dynamic"

import Link from "next/link"
import { Users, FileText, ArrowRight, Upload, FileSpreadsheet } from "lucide-react"

export default function ImportHomePage() {
  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Импорт данных</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
          Загрузите данные из Excel или 1С — арендаторов, начисления, договоры
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ImportCard
          href="/admin/import/tenants"
          title="Арендаторы"
          description="Загрузить список арендаторов из Excel или CSV. Авто-распознавание колонок, превью перед сохранением, привязка к помещениям по номеру."
          icon={Users}
          color="blue"
          available
        />

        <ImportCard
          href="/admin/finances/import"
          title="Платежи (банк-выписка)"
          description="Импорт платежей из CSV-выписки Kaspi Business / Halyk. Авто-матчинг арендаторов по БИН в назначении."
          icon={FileSpreadsheet}
          color="emerald"
          available
        />

        <ImportCard
          title="Начисления (история)"
          description="Перенос начислений за прошлые месяцы из 1С/Excel. Скоро."
          icon={FileText}
          color="amber"
          available={false}
        />

        <ImportCard
          title="Договоры"
          description="Импорт реестра договоров аренды (номер, даты, статус). Скоро."
          icon={Upload}
          color="purple"
          available={false}
        />
      </div>

      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4 text-sm text-blue-900 dark:text-blue-200">
        <p className="font-semibold mb-1">Как работать с 1С?</p>
        <p>
          В 1С: Бухгалтерии откройте справочник <i>«Контрагенты»</i> → меню <i>Файл → Сохранить как</i>{" "}
          → формат Excel (xlsx). Затем загрузите получившийся файл здесь — система сама распознает
          стандартные колонки. Если колонки в вашем файле названы нестандартно — скачайте наш шаблон,
          переложите данные и загружайте.
        </p>
      </div>
    </div>
  )
}

function ImportCard({ href, title, description, icon: Icon, color, available }: {
  href?: string
  title: string
  description: string
  icon: React.ElementType
  color: "blue" | "emerald" | "amber" | "purple"
  available: boolean
}) {
  const colors = {
    blue: { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", hover: "hover:border-blue-300 dark:border-blue-500/40 hover:bg-blue-50 dark:hover:bg-blue-500/10 dark:bg-blue-500/10/50" },
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", hover: "hover:border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 dark:bg-emerald-500/10/50" },
    amber: { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", hover: "hover:border-amber-300 dark:border-amber-500/40 hover:bg-amber-50 dark:hover:bg-amber-500/10 dark:bg-amber-500/10/50" },
    purple: { bg: "bg-purple-50 dark:bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", hover: "hover:border-purple-300 dark:border-purple-500/40 hover:bg-purple-50 dark:hover:bg-purple-500/10 dark:bg-purple-500/10/50" },
  }
  const c = colors[color]

  const content = (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 transition ${available ? c.hover : "opacity-50"}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`h-10 w-10 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${c.text}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
          {!available && <span className="inline-block text-[10px] text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/20 px-1.5 py-0.5 rounded mt-1">скоро</span>}
        </div>
        {available && <ArrowRight className="h-4 w-4 text-slate-400 dark:text-slate-500" />}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 leading-relaxed">{description}</p>
    </div>
  )

  if (available && href) return <Link href={href}>{content}</Link>
  return content
}
