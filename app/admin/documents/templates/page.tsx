import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function TemplatesHubRedirectPage() {
  redirect("/admin/settings/document-templates")
}
