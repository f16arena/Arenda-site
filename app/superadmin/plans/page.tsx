export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { safeServerValue } from "@/lib/server-fallback"
import { PlansClient } from "./plans-client"

export default async function PlansPage() {
  const { userId } = await requirePlatformOwner()

  const plans = await safeServerValue(
    db.plan.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { organizations: true } } },
    }),
    [],
    { source: "superadmin.plans.items", route: "/superadmin/plans", userId },
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Тарифы</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Настройка лимитов и фич для каждого плана</p>
      </div>

      <PlansClient plans={plans} />
    </div>
  )
}
