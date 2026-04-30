export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, FileText, Receipt, ClipboardCheck, FileCheck,
  Package as PackageIcon,
} from "lucide-react"
import { getActiveTemplate } from "@/app/actions/document-templates"
import { CustomTemplateBlock } from "@/components/documents/custom-template-block"

interface TypeMeta {
  type: "CONTRACT" | "INVOICE" | "ACT" | "RECONCILIATION"
  label: string
  description: string
  icon: React.ElementType
  previewHref: string
  color: string
}

const TYPES: TypeMeta[] = [
  {
    type: "CONTRACT",
    label: "Договор аренды",
    description: "Основной договор аренды нежилого помещения. Используется при заключении новых договоров.",
    icon: FileCheck,
    previewHref: "/admin/documents/templates/rental",
    color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    type: "INVOICE",
    label: "Счёт на оплату",
    description: "Ежемесячный счёт. Генерируется в /admin/documents/templates/invoice.",
    icon: Receipt,
    previewHref: "/admin/documents/templates/invoice",
    color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    type: "ACT",
    label: "Акт оказанных услуг",
    description: "Акт об оказании услуг аренды за период. Подписывается обеими сторонами.",
    icon: ClipboardCheck,
    previewHref: "/admin/documents/templates/act",
    color: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    type: "RECONCILIATION",
    label: "Акт сверки",
    description: "Акт взаиморасчётов с арендатором за период.",
    icon: FileText,
    previewHref: "/admin/documents/templates/reconciliation",
    color: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
]

export default async function TemplatesHubPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  // Загружаем активные шаблоны для всех типов параллельно
  const activeTemplates = await Promise.all(
    TYPES.map((t) =>
      getActiveTemplate(t.type)
        .then((tpl) => ({ type: t.type, tpl }))
        .catch(() => ({ type: t.type, tpl: null }))
    )
  )

  const activeMap = new Map(activeTemplates.map((x) => [x.type, x.tpl]))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/documents"
          className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <PackageIcon className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            Шаблоны документов
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Загрузите свой шаблон один раз — все документы этого типа будут генерироваться по нему
          </p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4 text-sm text-blue-900 dark:text-blue-200">
        <p className="font-medium mb-1">Как работают шаблоны</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-300">
          <li>Загрузите свой DOCX/XLSX шаблон с placeholder-ами вида <code className="font-mono bg-blue-100 dark:bg-blue-500/20 px-1 rounded">{"{tenant_name}"}</code>, <code className="font-mono bg-blue-100 dark:bg-blue-500/20 px-1 rounded">{"{period}"}</code></li>
          <li>При генерации документа система автоматически подставит данные арендатора</li>
          <li>Если шаблон не загружен — используется встроенный дизайн платформы</li>
          <li>В любой момент можно загрузить новый шаблон — старый автоматически деактивируется</li>
        </ol>
      </div>

      {/* Cards для каждого типа */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {TYPES.map((meta) => {
          const Icon = meta.icon
          const active = activeMap.get(meta.type)
          return (
            <div
              key={meta.type}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta.color} shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{meta.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{meta.description}</p>
                </div>
              </div>
              <div className="p-5">
                <CustomTemplateBlock documentType={meta.type} active={active ?? null} />
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Link
                    href={meta.previewHref}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    Открыть генератор {meta.label.toLowerCase()} →
                  </Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
