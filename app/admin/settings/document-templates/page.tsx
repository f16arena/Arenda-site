export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { DocumentTemplateSettings } from "@/components/documents/document-template-settings"

export default async function SettingsDocumentTemplatesPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  return <DocumentTemplateSettings />
}
