export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { FilePlus2 } from "lucide-react"
import { DocumentTemplateSettings } from "@/components/documents/document-template-settings"

export default async function SettingsDocumentTemplatesPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  // Конструкторы (договор/АВР) переехали в «Документы → Создать». Здесь остаётся
  // только загрузка кастомных шаблонов (счёт/АВР/сверка) — это настройка.
  return (
    <div className="space-y-4">
      <Link
        href="/admin/documents"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50"
      >
        <FilePlus2 className="h-4 w-4" />
        Создать документ — в «Документы → Создать»
      </Link>
      <DocumentTemplateSettings />
    </div>
  )
}
