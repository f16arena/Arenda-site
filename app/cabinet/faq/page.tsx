export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { CircleHelp } from "lucide-react"
import { auth } from "@/auth"
import { FaqSearch } from "@/components/faq/faq-search"
import { getFaqItemsFromDb } from "@/lib/faq-db"
import { requireOrgAccess } from "@/lib/org"
import { PageHeader } from "@/components/ui/page"
import { getT } from "@/lib/i18n/server"

export default async function TenantFaqPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "TENANT") redirect("/admin")
  const { orgId } = await requireOrgAccess()
  const items = await getFaqItemsFromDb(orgId, ["tenant"])
  const { t } = await getT()

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon={CircleHelp}
        tone="teal"
        title={t("cabinetSupport.faq.title")}
        subtitle={t("cabinetSupport.faq.subtitle")}
      />

      <FaqSearch
        items={items}
        audiences={["tenant"]}
        defaultAudience="tenant"
      />
    </div>
  )
}
