export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import type { ElementType } from "react"
import {
  ArrowLeft,
  ClipboardCheck,
  FileCheck,
  FileText,
  Receipt,
  Settings,
} from "lucide-react"

type CreateDocType = {
  label: string
  description: string
  href: string
  icon: ElementType
  color: string
}

const DOC_TYPES: CreateDocType[] = [
  {
    label: "Договор",
    description: "Договор аренды с автозаполнением арендатора, помещения и суммы.",
    href: "/admin/documents/new/contract",
    icon: FileCheck,
    color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    label: "Счёт на оплату",
    description: "Счёт за выбранный период с начислениями арендатора.",
    href: "/admin/documents/new/invoice",
    icon: Receipt,
    color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "АВР",
    description: "Акт выполненных работ / оказанных услуг за период.",
    href: "/admin/documents/new/act",
    icon: ClipboardCheck,
    color: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    label: "Акт сверки",
    description: "Сверка начислений, оплат и задолженности по арендатору.",
    href: "/admin/documents/new/reconciliation",
    icon: FileText,
    color: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
]

export default async function CreateDocumentPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/documents"
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            aria-label="Назад к документам"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Создать документ
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Выберите тип документа
            </p>
          </div>
        </div>
        <Link
          href="/admin/settings/document-templates"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <Settings className="h-4 w-4" />
          Шаблоны
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {DOC_TYPES.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 transition-colors hover:border-blue-300 dark:hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${item.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</p>
              <p className="mt-4 text-xs font-medium text-blue-600 dark:text-blue-400">
                Выбрать →
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
