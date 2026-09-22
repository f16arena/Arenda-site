import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Gauge } from "lucide-react"
import { submitTenantMeterReading } from "@/app/actions/meters"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatNumberL } from "@/lib/i18n/format"

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
    include: {
      space: { include: { meters: { include: { readings: { orderBy: { createdAt: "desc" }, take: 2 } } } } },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: {
          space: {
            include: {
              meters: { include: { readings: { orderBy: { createdAt: "desc" }, take: 2 } } },
            },
          },
        },
      },
    },
  })

  const locale = await getLocale()
  const { t } = await getT(locale)
  const num = (value: number) => formatNumberL(locale, value)
  const typeLabel = (type: string) => {
    const key = `cabinetDocs.meters.types.${type}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? type : label
  }

  const assignedSpaces = tenant?.tenantSpaces.length
    ? tenant.tenantSpaces.map((item) => item.space)
    : tenant?.space ? [tenant.space] : []

  if (!tenant || assignedSpaces.length === 0) {
    return (
      <div className="text-center py-16">
        <Gauge className="h-10 w-10 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
        <p className="text-slate-400 dark:text-slate-500">{t("cabinetDocs.meters.noSpace")}</p>
      </div>
    )
  }

  const currentPeriod = new Date().toISOString().slice(0, 7)
  const meters = assignedSpaces.flatMap((space) =>
    space.meters.map((meter) => ({ ...meter, spaceNumber: space.number })),
  )

  return (
    <div className="space-y-5 max-w-xl">
      <PageHeader
        icon={Gauge}
        title={t("cabinetDocs.meters.title")}
        subtitle={`${assignedSpaces.length > 1
          ? t("cabinetDocs.meters.spacesCount", { count: assignedSpaces.length })
          : t("cabinetDocs.meters.roomSubtitle", { number: assignedSpaces[0].number })} · ${currentPeriod}`}
      />

      {meters.length === 0 && (
        <Card className="block py-16 text-center">
          <Gauge className="h-8 w-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
          <p className="text-sm text-slate-400 dark:text-slate-500">{t("cabinetDocs.meters.empty")}</p>
        </Card>
      )}

      {meters.map((meter) => {
        const latest = meter.readings[0]
        const hasCurrent = latest?.period === currentPeriod

        return (
          <Card key={meter.id} className="block p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[meter.type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                {typeLabel(meter.type)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">#{meter.number}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{t("cabinetDocs.meters.room", { number: meter.spaceNumber })}</span>
              {hasCurrent && (
                <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 font-medium">{t("cabinetDocs.meters.submitted")}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t("cabinetDocs.meters.previous")}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {latest && !hasCurrent ? num(latest.value) :
                   latest && hasCurrent ? num(latest.previous) : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t("cabinetDocs.meters.current")}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {hasCurrent ? num(latest.value) : <span className="text-amber-500 text-sm">{t("cabinetDocs.meters.notSubmitted")}</span>}
                </p>
              </div>
            </div>

            {hasCurrent && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-4 py-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("cabinetDocs.meters.usage")} <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {num(latest.value - latest.previous)} {meter.type === "ELECTRICITY" ? t("cabinetDocs.meters.units.kwh") : t("cabinetDocs.meters.units.m3")}
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
                  <Input
                    name="value"
                    type="number"
                    step="0.01"
                    required
                    placeholder={t("cabinetDocs.meters.placeholder")}
                    className="flex-1"
                  />
                  <Button type="submit" className="font-medium">
                    {t("cabinetDocs.meters.submit")}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        )
      })}
    </div>
  )
}
