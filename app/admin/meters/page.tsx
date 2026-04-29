export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { Gauge } from "lucide-react"
import { MeterReadingDialog, AddMeterDialog, InlineReadingButton } from "./meter-actions"
import { DeleteAction } from "@/components/ui/delete-action"
import { deleteMeter } from "@/app/actions/meters"
import { requireOrgAccess } from "@/lib/org"
import { meterScope, spaceScope, tariffScope } from "@/lib/tenant-scope"

const typeLabel: Record<string, string> = {
  ELECTRICITY: "Электричество",
  WATER: "Вода",
  HEAT: "Тепло",
}

const typeColor: Record<string, string> = {
  ELECTRICITY: "bg-yellow-100 text-yellow-700",
  WATER: "bg-blue-100 text-blue-700",
  HEAT: "bg-orange-100 text-orange-700",
}

const TARIFF_TYPE_BY_METER: Record<string, string> = {
  ELECTRICITY: "ELECTRICITY",
  WATER: "WATER",
  HEAT: "HEATING",
}

export default async function MetersPage() {
  const { orgId } = await requireOrgAccess()
  const currentPeriod = new Date().toISOString().slice(0, 7)
  const prevDate = new Date()
  prevDate.setMonth(prevDate.getMonth() - 1)
  const prevPeriod = prevDate.toISOString().slice(0, 7)

  const [meters, spaces, tariffs] = await Promise.all([
    db.meter.findMany({
      where: meterScope(orgId),
      select: {
        id: true, type: true, number: true, spaceId: true,
        space: {
          select: {
            id: true, number: true,
            floor: { select: { id: true, name: true, number: true } },
            tenant: { select: { companyName: true } },
          },
        },
        readings: {
          where: { period: { in: [currentPeriod, prevPeriod] } },
          orderBy: { period: "desc" },
          select: { id: true, period: true, value: true, previous: true, createdAt: true },
        },
      },
    }).catch(() => []),
    db.space.findMany({
      where: spaceScope(orgId),
      select: {
        id: true, number: true, area: true, status: true,
        floor: { select: { id: true, name: true, number: true } },
      },
      orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
    }).catch(() => []),
    db.tariff.findMany({
      where: { AND: [tariffScope(orgId), { isActive: true }] },
      select: { id: true, type: true, name: true, rate: true, unit: true },
    }).catch(() => []),
  ])

  const tariffByType = new Map(tariffs.map((t) => [t.type, t]))

  const meterProps = meters.map((m) => ({
    id: m.id,
    type: m.type,
    number: m.number,
    space: { number: m.space.number },
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Счётчики</h1>
          <p className="text-sm text-slate-500 mt-0.5">{meters.length} счётчиков · {currentPeriod}</p>
        </div>
        <div className="flex gap-2">
          <AddMeterDialog spaces={spaces} />
          <MeterReadingDialog meters={meterProps} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Счётчик</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Помещение</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Арендатор</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Пред. период</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Тек. период</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Расход</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Тариф</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">К оплате</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {meters.map((meter) => {
              const current = meter.readings.find((r) => r.period === currentPeriod)
              const prev = meter.readings.find((r) => r.period === prevPeriod)
              const consumption = current ? (current.value - current.previous) : null
              const tariff = tariffByType.get(TARIFF_TYPE_BY_METER[meter.type] ?? "")
              const cost = consumption !== null && tariff ? Math.round(consumption * tariff.rate) : null

              return (
                <tr key={meter.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[meter.type] ?? "bg-slate-100 text-slate-500"}`}>
                        {typeLabel[meter.type] ?? meter.type}
                      </span>
                      <span className="text-slate-500 font-mono text-xs">#{meter.number}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-700">
                    Каб. {meter.space.number}
                    <span className="text-slate-400 ml-1">· {meter.space.floor.name}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {meter.space.tenant?.companyName ?? <span className="text-slate-400">Свободно</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right text-slate-600">
                    {prev ? prev.value.toLocaleString("ru-RU") : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {current ? (
                      <span className="font-medium text-slate-900">{current.value.toLocaleString("ru-RU")}</span>
                    ) : (
                      <span className="text-amber-500 text-xs">Не внесено</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {consumption !== null ? (
                      <span className="font-medium text-slate-900">{consumption.toLocaleString("ru-RU")}</span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right text-slate-500 text-xs">
                    {tariff ? `${tariff.rate} ₸/${tariff.unit}` : <span className="text-amber-500">не задан</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {cost !== null ? (
                      <span className="font-medium text-emerald-600">{cost.toLocaleString("ru-RU")} ₸</span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {!current && <InlineReadingButton meterId={meter.id} period={currentPeriod} />}
                      <DeleteAction
                        action={deleteMeter.bind(null, meter.id)}
                        entity="счётчик"
                        description="Все показания этого счётчика будут удалены."
                        successMessage="Счётчик удалён"
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
            {meters.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-16 text-center">
                  <Gauge className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Счётчики не добавлены</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
