export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { CircleHelp } from "lucide-react"
import { auth } from "@/auth"
import { FaqSearch } from "@/components/faq/faq-search"
import { type FaqAudience } from "@/lib/faq"
import { getFaqArticlesForAdmin, getFaqItemsFromDb } from "@/lib/faq-db"
import { requireOrgAccess } from "@/lib/org"
import { FaqManager } from "./faq-manager"

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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              <CircleHelp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">FAQ и инструкции</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Быстрые ответы по работе владельца и администратора в Commrent.
              </p>
            </div>
          </div>
        </div>
      </div>

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
