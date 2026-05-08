import { FileText } from "lucide-react"

import { db } from "@/lib/db"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { CHARGE_TYPES, formatMoney } from "@/lib/utils"

/**
 * Группирует charges арендатора по contracts. Charges без contract_id (исторические,
 * до миграции 022) выводятся в отдельной группе «Без привязки».
 */
export async function ChargesByContractSection({
  tenantId,
  orgId,
}: {
  tenantId: string
  orgId: string
}) {
  const [charges, contracts] = await Promise.all([
    db.charge.findMany({
      where: { tenantId, tenant: { user: { organizationId: orgId } } },
      select: {
        id: true,
        contractId: true,
        period: true,
        type: true,
        amount: true,
        isPaid: true,
      },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    db.contract.findMany({
      where: { tenantId, tenant: { user: { organizationId: orgId } } },
      select: { id: true, number: true, version: true, status: true, type: true },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    }),
  ])

  if (charges.length === 0) return null

  const contractMap = new Map(contracts.map((c) => [c.id, c]))
  const groups = new Map<string, typeof charges>()
  for (const charge of charges) {
    const key = charge.contractId ?? "__unbound__"
    const list = groups.get(key) ?? []
    list.push(charge)
    groups.set(key, list)
  }

  // Сортировка: контракты по version desc, без привязки — в самом низу
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "__unbound__") return 1
    if (b === "__unbound__") return -1
    const va = contractMap.get(a)?.version ?? 0
    const vb = contractMap.get(b)?.version ?? 0
    return vb - va
  })

  return (
    <CollapsibleCard
      title="Начисления по договорам"
      icon={FileText}
      meta={`${charges.length} записей`}
    >
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {sortedKeys.map((key) => {
          const list = groups.get(key) ?? []
          const total = list.reduce((s, c) => s + c.amount, 0)
          const unpaid = list.filter((c) => !c.isPaid).reduce((s, c) => s + c.amount, 0)
          const contract = key === "__unbound__" ? null : contractMap.get(key)
          const docLabel = contract?.type === "ADDENDUM" ? "Доп. соглашение" : "Договор"

          return (
            <div key={key} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {contract
                      ? `${docLabel} № ${contract.number}${contract.version > 1 ? ` (v${contract.version})` : ""}`
                      : "Начисления без привязки к договору"}
                  </p>
                  {contract && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Статус: {contract.status}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Всего: <b className="text-slate-900 dark:text-slate-100">{formatMoney(total)}</b></p>
                  {unpaid > 0 && (
                    <p className="text-xs text-red-600 dark:text-red-400">Долг: {formatMoney(unpaid)}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {list.slice(0, 12).map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <span className="text-slate-600 dark:text-slate-400">
                      {CHARGE_TYPES[c.type] ?? c.type} · {c.period}
                    </span>
                    <span className={c.isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                      {formatMoney(c.amount)}
                    </span>
                  </div>
                ))}
                {list.length > 12 && (
                  <p className="col-span-full text-[11px] text-slate-400 dark:text-slate-500 text-center mt-1">
                    + ещё {list.length - 12} начислений
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </CollapsibleCard>
  )
}
