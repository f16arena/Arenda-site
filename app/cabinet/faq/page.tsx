export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { CircleHelp } from "lucide-react"
import { auth } from "@/auth"
import { FaqSearch } from "@/components/faq/faq-search"
import { getFaqItemsFromDb } from "@/lib/faq-db"
import { requireOrgAccess } from "@/lib/org"
import { PageHeader } from "@/components/ui/page"

export default async function TenantFaqPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "TENANT") redirect("/admin")
  const { orgId } = await requireOrgAccess()
  const items = await getFaqItemsFromDb(orgId, ["tenant"])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon={CircleHelp}
        tone="teal"
        title="FAQ арендатора"
        subtitle="Вход, финансы, документы, подписание, заявки, счетчики и связь с администратором."
      />

      <FaqSearch
        items={items}
        audiences={["tenant"]}
        defaultAudience="tenant"
      />
    </div>
  )
}
