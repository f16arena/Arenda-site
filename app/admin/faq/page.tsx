export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { CircleHelp } from "lucide-react"
import { auth } from "@/auth"
import { FaqSearch } from "@/components/faq/faq-search"
import { type FaqAudience } from "@/lib/faq-types"
import { getFaqArticlesForAdmin, getFaqItemsFromDb } from "@/lib/faq-db"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { requireOrgAccess } from "@/lib/org"
import { FaqManager } from "./faq-manager"
import { PageHeader } from "@/components/ui/page"
import { getLocale, getT } from "@/lib/i18n/server"

export default async function AdminFaqPage() {
  const session = await auth()
  if (!session) redirect("/login")
  const { orgId } = await requireOrgAccess()
  const locale = await getLocale()
  const { t } = await getT(locale)

  const caps = new Set(
    await getAllowedCapabilityKeysForUser({
      userId: session.user.id,
      role: session.user.role,
      isPlatformOwner: session.user.isPlatformOwner,
      orgId,
    }),
  )
  const canManage = caps.has("faq.manage")

  const canSeeOwnerFaq = session.user.role === "OWNER" || session.user.isPlatformOwner
  const canManageFaq = session.user.role === "OWNER" || session.user.role === "ADMIN" || session.user.isPlatformOwner
  const audiences: FaqAudience[] = canSeeOwnerFaq ? ["owner", "admin"] : ["admin"]
  const defaultAudience: FaqAudience = canSeeOwnerFaq ? "owner" : "admin"
  // Редактор показывает язык интерфейса: правят тот вариант, который читают.
  const [items, adminArticles] = await Promise.all([
    getFaqItemsFromDb(orgId, audiences, locale),
    canManageFaq ? getFaqArticlesForAdmin(orgId, locale) : Promise.resolve([]),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        icon={CircleHelp}
        title={t("adminService.faq.title")}
        subtitle={t("adminService.faq.subtitle")}
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
          canManage={canManage}
        />
      )}
    </div>
  )
}
