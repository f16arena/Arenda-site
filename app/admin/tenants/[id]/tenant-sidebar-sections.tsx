import { FileText, Receipt } from "lucide-react"

import { ContractWorkflowActions } from "./contract-actions"
import { ContractVersionButton } from "./contract-version-button"
import { db } from "@/lib/db"
import { safeServerValue } from "@/lib/server-fallback"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { getT } from "@/lib/i18n/server"
import { formatDateL, formatMoneyL } from "@/lib/i18n/format"
import { measureServerStep } from "@/lib/server-performance"

type SidebarContext = {
  tenantId: string
  orgId: string
  userId: string
}

export async function TenantContractsSidebar({ tenantId, orgId, userId }: SidebarContext) {
  const { t, locale } = await getT()
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
          changeKind: true,
          appliedAt: true,
          startDate: true,
          endDate: true,
          signedByTenantAt: true,
          signedByLandlordAt: true,
          signToken: true,
          version: true,
          attachmentFileId: true,
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
    <CollapsibleCard
      title={t("adminTenants.contracts.title")}
      icon={FileText}
      meta={t("adminTenants.contracts.meta", { count: total })}
    >
      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {contracts.map((contract) => {
          // Справочник держит только цвет бейджа: подписи в словаре.
          const statusColors: Record<string, { cls: string }> = {
            DRAFT: { cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" },
            SENT: { cls: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300" },
            VIEWED: { cls: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300" },
            SIGNED_BY_TENANT: { cls: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300" },
            SIGNED: { cls: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" },
            REJECTED: { cls: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300" },
            ARCHIVED: { cls: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500" },
          }
          const known = statusColors[contract.status]
          const status = {
            // Незнакомый статус показываем кодом — это данные, не текст.
            label: known
              ? t(`adminTenants.contracts.statuses.${contract.status}` as "adminTenants.contracts.statuses.DRAFT")
              : contract.status,
            cls: known?.cls ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
          }
          const docLabel =
            contract.type === "ADDENDUM"
              ? t("adminTenants.contracts.addendum")
              : contract.type === "EXTERNAL"
                ? t("adminTenants.contracts.external")
                : t("adminTenants.contracts.contract")

          return (
            <div key={contract.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {docLabel} № {contract.number}
                  {contract.version > 1 && (
                    <span className="ml-1.5 text-[10px] font-normal text-slate-400 dark:text-slate-500">v{contract.version}</span>
                  )}
                </p>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.cls}`}>
                  {status.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                {contract.startDate ? formatDateL(locale, contract.startDate) : "—"} →{" "}
                {contract.endDate ? formatDateL(locale, contract.endDate) : "—"}
              </p>
              {contract.type === "ADDENDUM" && (
                <p className={`mt-1 text-[11px] ${
                  contract.status === "SIGNED" && contract.appliedAt
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-300"
                }`}>
                  {contract.status === "SIGNED"
                    ? contract.appliedAt
                      ? "Применено к условиям аренды"
                      : t("adminTenants.contracts.signedWaitingApply")
                    : "Изменения вступят только после подписи"}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {contract.type === "EXTERNAL" ? (
                  contract.attachmentFileId ? (
                    <a
                      href={`/api/storage/${contract.attachmentFileId}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" /> {t("adminTenants.contracts.downloadPdf")}
                    </a>
                  ) : (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {t("adminTenants.contracts.noPdf")}
                    </span>
                  )
                ) : (
                  <>
                    <ContractWorkflowActions contract={contract} />
                    {contract.type !== "ADDENDUM" && contract.status !== "ARCHIVED" && (
                      <ContractVersionButton
                        contractId={contract.id}
                        contractNumber={contract.number}
                        currentVersion={contract.version}
                        defaultStartDate={contract.startDate ? contract.startDate.toISOString().slice(0, 10) : null}
                        defaultEndDate={contract.endDate ? contract.endDate.toISOString().slice(0, 10) : null}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
        {contracts.length === 0 && (
          <p className="px-4 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            {t("adminTenants.contracts.empty")}
          </p>
        )}
      </div>
    </CollapsibleCard>
  )
}

export async function TenantRecentChargesSidebar({ tenantId, orgId, userId }: SidebarContext) {
  const { t, tp, locale } = await getT()
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
    <CollapsibleCard
      title={t("adminTenants.recentCharges.title")}
      icon={Receipt}
      meta={tp("adminTenants.recentCharges.meta", total)}
    >
      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {charges.map((charge) => (
          <div key={charge.id} className="flex items-center justify-between px-4 py-2.5">
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t(`domain.chargeTypes.${charge.type}` as "domain.chargeTypes.OTHER")}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{charge.period}</p>
            </div>
            <div className="text-right">
              <p className={`text-xs font-semibold ${charge.isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {formatMoneyL(locale, charge.amount)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                {charge.isPaid
                  ? t("adminTenants.recentCharges.paid")
                  : t("adminTenants.recentCharges.debt")}
              </p>
            </div>
          </div>
        ))}
        {charges.length === 0 && (
          <p className="px-4 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            {t("adminTenants.recentCharges.empty")}
          </p>
        )}
      </div>
    </CollapsibleCard>
  )
}
