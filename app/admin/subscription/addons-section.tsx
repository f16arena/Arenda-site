"use client"

import { useTransition } from "react"
import { Package, Send, CheckCircle2, Clock, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { requestAddon } from "@/app/actions/addons"
import type { AddonCatalogItem } from "@/lib/addons-catalog"

type ActiveAddon = {
  id: string
  addonCode: string
  quantity: number
  priceMonthly: number
  isActive: boolean
  startedAt: Date | string
  notes: string | null
}

/**
 * Активные/запрошенные аддоны + каталог с кнопкой «Заказать».
 * Платежи вручную: «Заказать» создаёт OrganizationAddon(isActive=false)
 * и шлёт уведомление супер-админу.
 */
export function AddonsSection({ catalog, active }: { catalog: AddonCatalogItem[]; active: ActiveAddon[] }) {
  const [pending, startTransition] = useTransition()

  function order(code: string, label: string) {
    startTransition(async () => {
      const r = await requestAddon({ addonCode: code, quantity: 1 })
      if (r.ok) toast.success(`Заявка отправлена: «${label}». Супер-админ получит уведомление.`)
      else toast.error(r.error ?? "Не удалось отправить заявку")
    })
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-slate-100">Ваши аддоны</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {active.map((a) => {
              const item = catalog.find((c) => c.code === a.addonCode)
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{item?.label ?? a.addonCode}{a.quantity > 1 ? ` × ${a.quantity}` : ""}</p>
                    <p className="text-xs text-slate-500">
                      {a.priceMonthly.toLocaleString("ru-RU")} ₸/мес ·
                      {a.isActive ? (
                        <span className="ml-1 inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" />активен</span>
                      ) : (
                        <span className="ml-1 inline-flex items-center gap-1 text-amber-400"><Clock className="h-3 w-3" />ожидает подтверждения</span>
                      )}
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
          <Package className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-slate-100">Доступные аддоны</h2>
        </div>
        {catalog.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Для текущего тарифа аддонов нет.</p>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {catalog.map((item) => (
              <div key={item.code} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-sm font-semibold text-slate-100">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">{item.description}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-100">
                    {item.priceMonthly.toLocaleString("ru-RU")} <span className="text-xs font-normal text-slate-500">₸/мес</span>
                  </p>
                  <button
                    onClick={() => order(item.code, item.label)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
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
