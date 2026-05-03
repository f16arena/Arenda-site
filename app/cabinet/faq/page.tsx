export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { CircleHelp } from "lucide-react"
import { auth } from "@/auth"
import { FaqSearch } from "@/components/faq/faq-search"
import { getFaqItems } from "@/lib/faq"

export default async function TenantFaqPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "TENANT") redirect("/admin")

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300">
          <CircleHelp className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">FAQ арендатора</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Вход, финансы, документы, подписание, заявки, счетчики и связь с администратором.
          </p>
        </div>
      </div>

      <FaqSearch
        items={getFaqItems(["tenant"])}
        audiences={["tenant"]}
        defaultAudience="tenant"
      />
    </div>
  )
}
