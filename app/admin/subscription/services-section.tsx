"use client"

import { useTransition } from "react"
import { Briefcase, Send, CheckCircle2, Clock, Loader2, FileBadge } from "lucide-react"
import { toast } from "sonner"
import { requestService } from "@/app/actions/services"
import type { ServiceCatalogItem } from "@/lib/services-catalog"
import { useT } from "@/lib/i18n/client"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"

type OrgService = {
  id: string
  serviceCode: string
  serviceName: string
  price: number
  status: string
  paidAt: Date | string | null
  deliveredAt: Date | string | null
  createdAt: Date | string
}

// Статусы услуги: подписи — в словаре, здесь только цвет и иконка.
const SERVICE_STATUSES = ["PENDING", "PAID", "DELIVERED", "CANCELLED"] as const
type ServiceStatus = (typeof SERVICE_STATUSES)[number]

const STATUS_STYLE: Record<ServiceStatus, { cls: string; icon: React.ElementType }> = {
  PENDING:   { cls: "text-amber-400",   icon: Clock },
  PAID:      { cls: "text-blue-400",    icon: FileBadge },
  DELIVERED: { cls: "text-emerald-400", icon: CheckCircle2 },
  CANCELLED: { cls: "text-slate-500",   icon: Clock },
}

function toServiceStatus(value: string): ServiceStatus {
  return SERVICE_STATUSES.includes(value as ServiceStatus) ? (value as ServiceStatus) : "PENDING"
}

/**
 * Активные/прошедшие услуги + каталог доступных под план.
 * Платежи вручную, кнопка «Заказать» создаёт OrganizationService(PENDING).
 */
export function ServicesSection({ catalog, active }: { catalog: ServiceCatalogItem[]; active: OrgService[] }) {
  const { t, locale } = useT()
  const [pending, startTransition] = useTransition()

  function order(code: string, label: string) {
    startTransition(async () => {
      const r = await requestService({ serviceCode: code })
      if (r.ok) toast.success(t("adminSettings.subscription.addons.ordered", { name: label }))
      else toast.error(r.error ?? t("adminSettings.subscription.addons.orderError"))
    })
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.subscription.services.history")}</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {active.map((s) => {
              const statusKey = toServiceStatus(s.status)
              const style = STATUS_STYLE[statusKey]
              const Icon = style.icon
              return (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{s.serviceName}</p>
                    <p className="text-xs text-slate-500">
                      {formatMoneyL(locale, s.price)} ·
                      <span className={`ml-1 inline-flex items-center gap-1 ${style.cls}`}>
                        <Icon className="h-3 w-3" />{t(`adminSettings.subscription.services.statuses.${statusKey}`)}
                      </span>
                      <span className="ml-2 text-slate-600">
                        {t("adminSettings.subscription.services.from", { date: formatDateShortL(locale, s.createdAt) })}
                      </span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.subscription.services.available")}</h2>
        </div>
        {catalog.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">{t("adminSettings.subscription.services.none")}</p>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {catalog.map((item) => (
              <div key={item.code} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4 flex flex-col">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed flex-1">{item.description}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {formatMoneyL(locale, item.price)}
                    </p>
                    {item.recurringMonthly ? (
                      <p className="text-[10px] text-slate-500">
                        + {formatMoneyL(locale, item.recurringMonthly)}{t("common.money.perMonth")}
                      </p>
                    ) : null}
                  </div>
                  <button
                    onClick={() => order(item.code, item.label)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    {t("adminSettings.subscription.addons.order")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
