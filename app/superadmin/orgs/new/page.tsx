export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { safeServerValue } from "@/lib/server-fallback"
import { CreateOrgForm } from "./create-form"

export default async function NewOrgPage() {
  const { userId } = await requirePlatformOwner()

  const plans = await safeServerValue(
    db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, priceMonthly: true, maxBuildings: true, maxTenants: true },
    }),
    [],
    { source: "superadmin.orgs.new.plans", route: "/superadmin/orgs/new", userId },
  )

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Новая организация</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Создайте проект для нового клиента</p>
      </div>

      <CreateOrgForm plans={plans} />
    </div>
  )
}
