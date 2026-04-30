import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Gauge } from "lucide-react"
import { submitTenantMeterReading } from "@/app/actions/meters"

const typeLabel: Record<string, string> = {
  ELECTRICITY: "Электричество",
  WATER: "Вода",
  HEAT: "Тепло",
}
const typeColor: Record<string, string> = {
  ELECTRICITY: "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
  WATER: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
  HEAT: "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300",
}

export default async function CabinetMetersPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: { space: { include: { meters: { include: { readings: { orderBy: { createdAt: "desc" }, take: 2 } } } } } },
  })

  if (!tenant?.space) {
    return (
      <div className="text-center py-16">
        <Gauge className="h-10 w-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 dark:text-slate-500">У вас нет привязанного помещения</p>
      </div>
    )
  }

  const currentPeriod = new Date().toISOString().slice(0, 7)
  const meters = tenant.space.meters

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Счётчики</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Кабинет {tenant.space.number} · {currentPeriod}</p>
      </div>

      {meters.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-16 text-center">
          <Gauge className="h-8 w-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Счётчики не установлены</p>
        </div>
      )}

      {meters.map((meter) => {
        const latest = meter.readings[0]
        const hasCurrent = latest?.period === currentPeriod

        return (
          <div key={meter.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[meter.type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500"}`}>
                {typeLabel[meter.type] ?? meter.type}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 font-mono">#{meter.number}</span>
              {hasCurrent && (
                <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Показания внесены</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Предыдущее</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {latest && !hasCurrent ? latest.value.toLocaleString("ru-RU") :
                   latest && hasCurrent ? latest.previous.toLocaleString("ru-RU") : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Текущее</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {hasCurrent ? latest.value.toLocaleString("ru-RU") : <span className="text-amber-500 text-sm">Не внесено</span>}
                </p>
              </div>
            </div>

            {hasCurrent && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-4 py-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Расход за период: <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {(latest.value - latest.previous).toLocaleString("ru-RU")} {meter.type === "ELECTRICITY" ? "кВт·ч" : "м³"}
                </span></p>
              </div>
            )}

            {!hasCurrent && (
              <form action={async (fd) => {
                "use server"
                await submitTenantMeterReading(fd)
              }}>
                <input type="hidden" name="meterId" value={meter.id} />
                <div className="flex gap-3">
                  <input
                    name="value"
                    type="number"
                    step="0.01"
                    required
                    placeholder="Введите текущее показание"
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <button type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    Передать
                  </button>
                </div>
              </form>
            )}
          </div>
        )
      })}
    </div>
  )
}
