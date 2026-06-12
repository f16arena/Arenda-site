export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { CircleHelp } from "lucide-react"
import { auth } from "@/auth"
import { FaqSearch } from "@/components/faq/faq-search"
import { type FaqAudience } from "@/lib/faq-types"
import { getFaqArticlesForAdmin, getFaqItemsFromDb } from "@/lib/faq-db"
import { requireOrgAccess } from "@/lib/org"
import { FaqManager } from "./faq-manager"
import { PageHeader } from "@/components/ui/page"

export default async function AdminFaqPage() {
  const session = await auth()
  if (!session) redirect("/login")
  const { orgId } = await requireOrgAccess()

  const canSeeOwnerFaq = session.user.role === "OWNER" || session.user.isPlatformOwner
  const canManageFaq = session.user.role === "OWNER" || session.user.role === "ADMIN" || session.user.isPlatformOwner
  const audiences: FaqAudience[] = canSeeOwnerFaq ? ["owner", "admin"] : ["admin"]
  const defaultAudience: FaqAudience = canSeeOwnerFaq ? "owner" : "admin"
  const [items, adminArticles] = await Promise.all([
    getFaqItemsFromDb(orgId, audiences),
    canManageFaq ? getFaqArticlesForAdmin(orgId) : Promise.resolve([]),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        icon={CircleHelp}
        title="FAQ и инструкции"
        subtitle="Быстрые ответы по работе владельца и администратора в Commrent."
      />

      <FaqSearch
        items={items}
        audiences={audiences}
        defaultAudience={defaultAudience}
      />

      {canManageFaq && (
        <FaqManager
          articles={adminArticles}
          audiences={["owner", "admin", "tenant"]}
          defaultAudience={defaultAudience}
        />
      )}
    </div>
  )
}
