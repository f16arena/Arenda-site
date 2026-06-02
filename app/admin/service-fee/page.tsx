export const dynamic = "force-dynamic"

import Link from "next/link"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { Sparkles, Snowflake, Sun, ArrowRight, AlertCircle } from "lucide-react"
import { resolveServiceFeeSettings } from "@/lib/service-fee-settings"

export default async function ServiceFeeListPage() {
  await requireCapabilityAndFeature("buildings.view")
  const { orgId } = await requireOrgAccess()

  const buildings = await db.building.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      totalArea: true,
      serviceFeeWinterRate: true,
      serviceFeeSummerRate: true,
      serviceFeeWinterMonths: true,
      serviceFeeIndexationPct: true,
      serviceFeeLastIndexedAt: true,
    },
  })

  const missing = buildings.filter((b) => b.serviceFeeWinterRate === null || b.serviceFeeSummerRate === null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Эксплуатационный сбор
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Сезонные тарифы на каждом здании. Применяются автоматически: каждое 1-е число
          месяца cron создаёт начисление SERVICE_FEE для каждого активного арендатора
          (площадь × тариф сезона), плюс автоматическая годовая индексация.
        </p>
      </div>

      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Не настроено: {missing.length} {missing.length === 1 ? "здание" : "зданий"}
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
            Пока тариф не задан — счета SERVICE_FEE по этому зданию не создаются и в договоре пустые поля.
          </p>
        </div>
      )}

      {buildings.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <p className="text-sm text-slate-500">У вас пока нет зданий. <Link href="/admin/buildings" className="text-blue-600 hover:underline">Создать первое</Link></p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Здание</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1"><Snowflake className="h-3 w-3 text-blue-500" />Зима</span>
                </th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1"><Sun className="h-3 w-3 text-orange-500" />Лето</span>
                </th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Месяцы зимы</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Индексация</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Последняя</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {buildings.map((b) => {
                const settings = resolveServiceFeeSettings(b)
                const isConfigured = b.serviceFeeWinterRate !== null && b.serviceFeeSummerRate !== null
                return (
                  <tr key={b.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="px-5 py-3">
                      <Link href={`/admin/buildings/${b.id}/service-fee`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400">
                        {b.name}
                      </Link>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{b.address}</p>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-900 dark:text-slate-100">
                      {b.serviceFeeWinterRate
                        ? <>{b.serviceFeeWinterRate.toLocaleString("ru-RU")}<span className="text-xs text-slate-500 ml-0.5">₸/м²</span></>
                        : <span className="text-amber-600 dark:text-amber-400 text-xs">не задан</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-900 dark:text-slate-100">
                      {b.serviceFeeSummerRate
                        ? <>{b.serviceFeeSummerRate.toLocaleString("ru-RU")}<span className="text-xs text-slate-500 ml-0.5">₸/м²</span></>
                        : <span className="text-amber-600 dark:text-amber-400 text-xs">не задан</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {settings.winterMonths.length === 7 && settings.winterMonths.join(",") === "1,2,3,4,10,11,12"
                        ? "окт-апр (дефолт)"
                        : settings.winterMonths.map((m) => MONTHS_SHORT[m - 1]).join(", ")}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-700 dark:text-slate-300">
                      {settings.indexationPct}%/год
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {b.serviceFeeLastIndexedAt
                        ? new Date(b.serviceFeeLastIndexedAt).toLocaleDateString("ru-RU")
                        : isConfigured ? "ещё не было" : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/buildings/${b.id}/service-fee`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Настроить <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 text-xs text-slate-600 dark:text-slate-400">
        <p className="font-semibold mb-2 text-slate-700 dark:text-slate-300">Как это работает</p>
        <ul className="space-y-1 ml-4 list-disc marker:text-slate-400">
          <li>Тариф настраивается на каждом здании индивидуально — рекомендуется задавать сразу при создании.</li>
          <li>Площадь арендатора определяется автоматически — сумма помещений и/или этажей в этом здании.</li>
          <li>В первый месяц после въезда счёт пропорциональный (с даты заезда до конца месяца).</li>
          <li>Раз в год ставки автоматически индексируются на указанный процент (по умолчанию 10%).</li>
          <li>В шаблоне договора используй метки <code className="px-1 py-0.5 bg-slate-200 dark:bg-slate-800 rounded">{"{service_fee_winter_rate}"}</code>, <code className="px-1 py-0.5 bg-slate-200 dark:bg-slate-800 rounded">{"{service_fee_summer_rate}"}</code>, <code className="px-1 py-0.5 bg-slate-200 dark:bg-slate-800 rounded">{"{service_fee_winter_total}"}</code> — подставятся автоматически.</li>
        </ul>
      </div>
    </div>
  )
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
