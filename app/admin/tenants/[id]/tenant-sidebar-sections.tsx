import { FileText, Receipt } from "lucide-react"

import { ContractWorkflowActions } from "./contract-actions"
import { db } from "@/lib/db"
import { safeServerValue } from "@/lib/server-fallback"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { CHARGE_TYPES, formatDate, formatMoney } from "@/lib/utils"
import { measureServerStep } from "@/lib/server-performance"

type SidebarContext = {
  tenantId: string
  orgId: string
  userId: string
}

export async function TenantContractsSidebar({ tenantId, orgId, userId }: SidebarContext) {
  const [contracts, total] = await measureServerStep("/admin/tenants/[id]", "tenant-contracts-sidebar", Promise.all([
    safeServerValue(
      db.contract.findMany({
        where: { tenantId, tenant: { user: { organizationId: orgId } } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          startDate: true,
          endDate: true,
          signedByTenantAt: true,
          signedByLandlordAt: true,
          signToken: true,
        },
      }),
      [],
      { source: "tenantDetail.sidebar.contracts", route: "/admin/tenants/[id]", orgId, userId, entityId: tenantId },
    ),
    safeServerValue(
      db.contract.count({ where: { tenantId, tenant: { user: { organizationId: orgId } } } }),
      0,
      { source: "tenantDetail.sidebar.contractCount", route: "/admin/tenants/[id]", orgId, userId, entityId: tenantId },
    ),
  ]))

  return (
    <CollapsibleCard title="Договоры" icon={FileText} meta={`${total} шт.`}>
      <div className="divide-y divide-slate-50">
        {contracts.map((contract) => {
          const statusLabels: Record<string, { label: string; cls: string }> = {
            DRAFT: { label: "Черновик", cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" },
            SENT: { label: "Отправлен", cls: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300" },
            VIEWED: { label: "Открыт арендатором", cls: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300" },
            SIGNED_BY_TENANT: { label: "Ждет нашей подписи", cls: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300" },
            SIGNED: { label: "Подписан", cls: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" },
            REJECTED: { label: "Отклонен", cls: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300" },
          }
          const status = statusLabels[contract.status] ?? {
            label: contract.status,
            cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
          }
          const docLabel = contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор"

          return (
            <div key={contract.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {docLabel} № {contract.number}
                </p>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.cls}`}>
                  {status.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                {contract.startDate ? formatDate(contract.startDate) : "—"} → {contract.endDate ? formatDate(contract.endDate) : "—"}
              </p>
              <div className="mt-2">
                <ContractWorkflowActions contract={contract} />
              </div>
            </div>
          )
        })}
        {contracts.length === 0 && (
          <p className="px-4 py-4 text-center text-xs text-slate-400 dark:text-slate-500">Нет договоров</p>
        )}
      </div>
    </CollapsibleCard>
  )
}

export async function TenantRecentChargesSidebar({ tenantId, orgId, userId }: SidebarContext) {
  const [charges, total] = await measureServerStep("/admin/tenants/[id]", "tenant-charges-sidebar", Promise.all([
    safeServerValue(
      db.charge.findMany({
        where: { tenantId, tenant: { user: { organizationId: orgId } } },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          period: true,
          type: true,
          amount: true,
          isPaid: true,
        },
      }),
      [],
      { source: "tenantDetail.sidebar.charges", route: "/admin/tenants/[id]", orgId, userId, entityId: tenantId },
    ),
    safeServerValue(
      db.charge.count({ where: { tenantId, tenant: { user: { organizationId: orgId } } } }),
      0,
      { source: "tenantDetail.sidebar.chargeCount", route: "/admin/tenants/[id]", orgId, userId, entityId: tenantId },
    ),
  ]))

  return (
    <CollapsibleCard title="Последние начисления" icon={Receipt} meta={`${total} записей`}>
      <div className="divide-y divide-slate-50">
        {charges.map((charge) => (
          <div key={charge.id} className="flex items-center justify-between px-4 py-2.5">
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {CHARGE_TYPES[charge.type] ?? charge.type}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{charge.period}</p>
            </div>
            <div className="text-right">
              <p className={`text-xs font-semibold ${charge.isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {formatMoney(charge.amount)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                {charge.isPaid ? "Оплачено" : "Долг"}
              </p>
            </div>
          </div>
        ))}
        {charges.length === 0 && (
          <p className="px-4 py-4 text-center text-xs text-slate-400 dark:text-slate-500">Начислений нет</p>
        )}
      </div>
    </CollapsibleCard>
  )
}
