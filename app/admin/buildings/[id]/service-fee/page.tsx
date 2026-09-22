export const dynamic = "force-dynamic"

import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingAccess } from "@/lib/building-access"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { ArrowLeft, Sparkles } from "lucide-react"
import { ServiceFeeForm } from "../../service-fee-form"
import { resolveServiceFeeSettings } from "@/lib/service-fee-settings"
import { getT } from "@/lib/i18n/server"

// Метки шаблона договора — технические имена, они одинаковы в обоих языках.
const CONTRACT_TAGS = "{service_fee_winter_rate}, {service_fee_summer_rate}, {service_fee_winter_total}, {service_fee_summer_total}"

export default async function BuildingServiceFeePage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT()
  await requireCapabilityAndFeature("buildings.edit")
  const { orgId } = await requireOrgAccess()
  const { id } = await params
  await assertBuildingInOrg(id, orgId)
  await assertBuildingAccess(id, orgId)

  const building = await db.building.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      address: true,
      serviceFeeWinterRate: true,
      serviceFeeSummerRate: true,
      serviceFeeWinterMonths: true,
      serviceFeeIndexationPct: true,
      serviceFeeLastIndexedAt: true,
    },
  })
  if (!building) notFound()

  const settings = resolveServiceFeeSettings(building)

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <Link
          href="/admin/buildings"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("adminObjects.serviceFee.back")}
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          {t("adminObjects.serviceFee.pageTitle", { building: building.name })}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {t("adminObjects.serviceFee.pageSubtitle")}
        </p>
      </div>

      <ServiceFeeForm
        buildingId={building.id}
        initialWinterRate={building.serviceFeeWinterRate}
        initialSummerRate={building.serviceFeeSummerRate}
        initialWinterMonths={settings.winterMonths}
        initialIndexationPct={settings.indexationPct}
        lastIndexedAt={building.serviceFeeLastIndexedAt}
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 text-xs text-slate-600 dark:text-slate-400">
        <p className="font-semibold mb-1.5 text-slate-700 dark:text-slate-300">{t("adminObjects.serviceFee.howItWorks")}</p>
        <ul className="space-y-1 ml-4 list-disc marker:text-slate-400">
          <li>{t("adminObjects.serviceFee.rule1")}</li>
          <li>{t("adminObjects.serviceFee.rule2")}</li>
          <li>{t("adminObjects.serviceFee.rule3")}</li>
          <li>{t("adminObjects.serviceFee.rule4")}</li>
          <li>{t("adminObjects.serviceFee.rule5", { tags: CONTRACT_TAGS })}</li>
        </ul>
      </div>
    </div>
  )
}
