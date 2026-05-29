export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { DocumentTemplateSettings } from "@/components/documents/document-template-settings"
import { DocumentTemplatesTabs } from "@/components/contract-constructor/document-templates-tabs"

export default async function SettingsDocumentTemplatesPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  // Конструктор договора — основная вкладка; старая загрузка шаблонов (счёт/АВР/
  // сверка) передаётся как server-component (рендерится на сервере, читает
  // активные шаблоны) и доступна во второй вкладке до миграции на конструктор.
  return <DocumentTemplatesTabs legacy={<DocumentTemplateSettings />} />
}
