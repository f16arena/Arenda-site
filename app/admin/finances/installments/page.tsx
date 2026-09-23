export const dynamic = "force-dynamic"

import { restrictedBuildingIds, tenantInBuildingIds } from "@/lib/building-access"
import { RouteTabs } from "@/components/ui/route-tabs"
import { financeTabs } from "@/lib/hub-tabs"
import { db } from "@/lib/db"
import Link from "next/link"
import { CalendarClock, ArrowLeft } from "lucide-react"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import { PageHeader, Card } from "@/components/ui/page"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { tenantScope } from "@/lib/tenant-scope"
import { safeServerValue } from "@/lib/server-fallback"
import { CreateInstallmentDialog, MarkInstallmentPaidButton, CancelPlanButton } from "./installments-actions"

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  BROKEN: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400",
}

export default async function InstallmentsPage() {
  const { orgId } = await requireOrgAccess()
  const locale = await getLocale()
  const { t } = await getT(locale)
  const money = (amount: number) => formatMoneyL(locale, amount)
  const statusLabel = (status: string) => {
    const key = `adminFinance.installments.statuses.${status}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? status : label
  }
  const bIds = await restrictedBuildingIds(orgId)
  const session = await auth()
  const caps = session?.user
    ? new Set(await getAllowedCapabilityKeysForUser({
        userId: session.user.id,
        role: session.user.role,
        isPlatformOwner: !!session.user.isPlatformOwner,
        orgId,
      }))
    : new Set<string>()
  const canInstallments = caps.has("finance.installments")
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/finances/installments", orgId })

  const [plans, debtorAgg] = await Promise.all([
    safe(
      "admin.installments.plans",
      db.debtInstallmentPlan.findMany({
        where: { tenant: bIds ? { AND: [tenantScope(orgId), tenantInBuildingIds(bIds)] } : tenantScope(orgId) },
        select: {
          id: true, totalAmount: true, status: true, note: true, createdAt: true,
          tenant: { select: { id: true, companyName: true } },
          installments: {
            select: { id: true, seq: true, dueDate: true, amount: true, isPaid: true },
            orderBy: { seq: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      [],
    ),
    safe(
      "admin.installments.debtorAgg",
      db.charge.groupBy({
        by: ["tenantId"],
        where: {
          isPaid: false,
          deletedAt: null,
          installmentPlanId: null,
          type: { notIn: ["DEPOSIT", "DEPOSIT_REFUND"] },
          tenant: tenantScope(orgId),
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 100,
      }),
      [] as Array<{ tenantId: string; _sum: { amount: number | null } }>,
    ),
  ])

  const debtorIds = debtorAgg.map((d) => d.tenantId)
  const debtorNames = debtorIds.length
    ? await safe(
        "admin.installments.debtorNames",
        db.tenant.findMany({ where: { id: { in: debtorIds } }, select: { id: true, companyName: true } }),
        [] as Array<{ id: string; companyName: string }>,
      )
    : []
  const debtors = debtorAgg
    .map((d) => ({
      id: d.tenantId,
      // Арендатор назван row, а не t: иначе перекрывает переводчик.
      companyName: debtorNames.find((row) => row.id === d.tenantId)?.companyName ?? "—",
      debt: d._sum.amount ?? 0,
    }))
    .filter((d) => d.debt > 0)

  const activeCount = plans.filter((p) => p.status === "ACTIVE").length

  return (
    <div className="space-y-5">
      <RouteTabs items={financeTabs(t)} className="mb-2" />
      <PageHeader
        icon={CalendarClock}
        title={t("adminFinance.installments.title")}
        subtitle={t("adminFinance.installments.subtitle")}
        actions={
          <>
            <Link
              href="/admin/finances"
              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("adminFinance.installments.toFinances")}
            </Link>
            {canInstallments && <CreateInstallmentDialog debtors={debtors} />}
          </>
        }
      />

      {plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title={t("adminFinance.installments.emptyTitle")}
            description={t("adminFinance.installments.emptyText")}
          />
        </Card>
      ) : (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("adminFinance.installments.activeCount", { active: activeCount, total: plans.length })}
          </p>
          <div className="space-y-4">
            {plans.map((plan) => {
              const paidCount = plan.installments.filter((i) => i.isPaid).length
              const paidAmount = plan.installments.filter((i) => i.isPaid).reduce((s, i) => s + i.amount, 0)
              const nextDue = plan.installments.find((i) => !i.isPaid)
              return (
                <Card key={plan.id} padded={false}>
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{plan.tenant.companyName}</span>
                      <Badge className={STATUS_STYLES[plan.status] ?? STATUS_STYLES.CANCELLED}>
                        {statusLabel(plan.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {t("adminFinance.installments.repaid", {
                          paid: money(paidAmount),
                          total: money(plan.totalAmount),
                          paidCount,
                          totalCount: plan.installments.length,
                        })}
                      </span>
                      {nextDue && plan.status === "ACTIVE" && (
                        <span>
                          {t("adminFinance.installments.nextPayment", {
                            date: formatDateShortL(locale, nextDue.dueDate),
                            amount: money(nextDue.amount),
                          })}
                        </span>
                      )}
                      {canInstallments && (plan.status === "ACTIVE" || plan.status === "BROKEN") && <CancelPlanButton planId={plan.id} />}
                    </div>
                  </div>
                  {plan.note && <div className="px-5 pt-3 text-xs text-slate-500 dark:text-slate-400">{plan.note}</div>}
                  <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {plan.installments.map((inst) => {
                      const overdue = !inst.isPaid && new Date(inst.dueDate) < new Date()
                      return (
                        <div
                          key={inst.id}
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            inst.isPaid
                              ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5"
                              : overdue
                                ? "border-red-200 bg-red-50/50 dark:border-red-500/20 dark:bg-red-500/5"
                                : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-700 dark:text-slate-300">№{inst.seq}</span>
                            <span className="text-slate-500 dark:text-slate-400">{formatDateShortL(locale, inst.dueDate)}</span>
                          </div>
                          <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{money(inst.amount)}</div>
                          <div className="mt-1.5">
                            {inst.isPaid ? (
                              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{t("adminFinance.installments.installmentPaid")}</span>
                            ) : canInstallments ? (
                              <MarkInstallmentPaidButton installmentId={inst.id} />
                            ) : (
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">{t("adminFinance.installments.installmentUnpaid")}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
