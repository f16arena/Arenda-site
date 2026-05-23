export const dynamic = "force-dynamic"

import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { ArrowLeft, Sparkles } from "lucide-react"
import { ServiceFeeForm } from "../../service-fee-form"
import { resolveServiceFeeSettings } from "@/lib/service-fee-settings"

export default async function BuildingServiceFeePage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapabilityAndFeature("buildings.edit")
  const { orgId } = await requireOrgAccess()
  const { id } = await params
  await assertBuildingInOrg(id, orgId)

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
          К списку зданий
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Эксплуатационный сбор · {building.name}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Сезонные тарифы за м²/мес. Применяются автоматически в Приложении №3 к договору
          и в ежемесячных начислениях.
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
        <p className="font-semibold mb-1.5 text-slate-700 dark:text-slate-300">Как работает</p>
        <ul className="space-y-1 ml-4 list-disc marker:text-slate-400">
          <li>Каждое 1-е число cron создаёт начисление Charge типа SERVICE_FEE для каждого
            активного арендатора этого здания.</li>
          <li>Площадь арендатора = сумма всех его помещений и/или этажей.</li>
          <li>Если арендатор въехал не с 1-го — первое начисление пропорциональное (по дням).</li>
          <li>Раз в год ставки автоматически индексируются на указанный процент.</li>
          <li>В шаблоне договора используй метки {"{service_fee_winter_rate}"}, {"{service_fee_summer_rate}"},
            {"{service_fee_winter_total}"}, {"{service_fee_summer_total}"} — данные подставятся
            автоматически из настроек здания.</li>
        </ul>
      </div>
    </div>
  )
}
