"use client"

import { useTransition } from "react"
import { Briefcase, Send, CheckCircle2, Clock, Loader2, FileBadge } from "lucide-react"
import { toast } from "sonner"
import { requestService } from "@/app/actions/services"
import type { ServiceCatalogItem } from "@/lib/services-catalog"

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

const STATUS_LABEL: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  PENDING:   { label: "ожидает оплаты", cls: "text-amber-400",   icon: Clock },
  PAID:      { label: "в работе",        cls: "text-blue-400",    icon: FileBadge },
  DELIVERED: { label: "выполнено",       cls: "text-emerald-400", icon: CheckCircle2 },
  CANCELLED: { label: "отменено",        cls: "text-slate-500",   icon: Clock },
}

/**
 * Активные/прошедшие услуги + каталог доступных под план.
 * Платежи вручную, кнопка «Заказать» создаёт OrganizationService(PENDING).
 */
export function ServicesSection({ catalog, active }: { catalog: ServiceCatalogItem[]; active: OrgService[] }) {
  const [pending, startTransition] = useTransition()

  function order(code: string, label: string) {
    startTransition(async () => {
      const r = await requestService({ serviceCode: code })
      if (r.ok) toast.success(`Заявка отправлена: «${label}». Супер-админ получит уведомление.`)
      else toast.error(r.error ?? "Не удалось отправить заявку")
    })
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-100">История разовых услуг</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {active.map((s) => {
              const status = STATUS_LABEL[s.status] ?? STATUS_LABEL.PENDING
              const Icon = status.icon
              return (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{s.serviceName}</p>
                    <p className="text-xs text-slate-500">
                      {s.price.toLocaleString("ru-RU")} ₸ ·
                      <span className={`ml-1 inline-flex items-center gap-1 ${status.cls}`}>
                        <Icon className="h-3 w-3" />{status.label}
                      </span>
                      <span className="ml-2 text-slate-600">
                        от {new Date(s.createdAt).toLocaleDateString("ru-RU")}
                      </span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-slate-100">Разовые услуги под ваш тариф</h2>
        </div>
        {catalog.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Для текущего тарифа нет доступных разовых услуг.</p>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {catalog.map((item) => (
              <div key={item.code} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 flex flex-col">
                <p className="text-sm font-semibold text-slate-100">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed flex-1">{item.description}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-100">
                      {item.price.toLocaleString("ru-RU")} <span className="text-xs font-normal text-slate-500">₸</span>
                    </p>
                    {item.recurringMonthly ? (
                      <p className="text-[10px] text-slate-500">+ {item.recurringMonthly.toLocaleString("ru-RU")} ₸/мес</p>
                    ) : null}
                  </div>
                  <button
                    onClick={() => order(item.code, item.label)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Заказать
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
