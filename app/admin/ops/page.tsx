export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  FileSignature,
  ShieldCheck,
  Wallet,
} from "lucide-react"
import { db } from "@/lib/db"
import { requireSection } from "@/lib/acl"
import { requireOrgAccess } from "@/lib/org"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { formatMoney } from "@/lib/utils"
import { safeServerValue } from "@/lib/server-fallback"
import { measureServerRoute } from "@/lib/server-performance"
import type { Prisma } from "@/app/generated/prisma/client"

const LIST_LIMIT = 5

export default async function AdminOpsPage() {
  return measureServerRoute("/admin/ops", async () => {
    await requireSection("dashboard", "view")
    const { orgId } = await requireOrgAccess()
    const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
      safeServerValue(promise, fallback, { source, route: "/admin/ops", orgId })

    const currentBuildingId = await getCurrentBuildingId()
    if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
    const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
    const visibleBuildingIds = currentBuildingId ? [currentBuildingId] : accessibleBuildingIds

    const floorIds = await safe(
      "admin.ops.floorIds",
      db.floor.findMany({
        where: { buildingId: { in: visibleBuildingIds } },
        select: { id: true },
      }).then((rows) => rows.map((row) => row.id)),
      [] as string[],
    )

    const tenantInVisibleBuildings: Prisma.TenantWhereInput = {
      user: { organizationId: orgId },
      OR: [
        { space: { floorId: { in: floorIds } } },
        { tenantSpaces: { some: { space: { floorId: { in: floorIds } } } } },
        { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
      ],
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in30Days = new Date(today)
    in30Days.setDate(today.getDate() + 30)

    const [
      overdueAgg,
      overdueCharges,
      paymentReportsAgg,
      paymentReports,
      requests,
      tasks,
      signatureContracts,
      expiringTenants,
      missingContactsCount,
      noSignedContractCount,
      occupiedWithoutTenantCount,
    ] = await Promise.all([
      safe(
        "admin.ops.overdueAgg",
        db.charge.aggregate({
          where: { tenant: tenantInVisibleBuildings, isPaid: false, dueDate: { lt: today } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        { _sum: { amount: 0 }, _count: { _all: 0 } },
      ),
      safe(
        "admin.ops.overdueCharges",
        db.charge.findMany({
          where: { tenant: tenantInVisibleBuildings, isPaid: false, dueDate: { lt: today } },
          select: {
            id: true,
            amount: true,
            dueDate: true,
            tenant: { select: { id: true, companyName: true } },
          },
          orderBy: [{ dueDate: "asc" }, { amount: "desc" }],
          take: LIST_LIMIT,
        }),
        [] as Array<{ id: string; amount: number; dueDate: Date | null; tenant: { id: string; companyName: string } }>,
      ),
      safe(
        "admin.ops.paymentReportsAgg",
        db.paymentReport.aggregate({
          where: { tenant: tenantInVisibleBuildings, status: { in: ["PENDING", "DISPUTED"] } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        { _sum: { amount: 0 }, _count: { _all: 0 } },
      ),
      safe(
        "admin.ops.paymentReports",
        db.paymentReport.findMany({
          where: { tenant: tenantInVisibleBuildings, status: { in: ["PENDING", "DISPUTED"] } },
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            tenant: { select: { id: true, companyName: true } },
          },
          orderBy: { createdAt: "asc" },
          take: LIST_LIMIT,
        }),
        [] as Array<{ id: string; amount: number; status: string; createdAt: Date; tenant: { id: string; companyName: string } }>,
      ),
      safe(
        "admin.ops.requests",
        db.request.findMany({
          where: { tenant: tenantInVisibleBuildings, status: { in: ["NEW", "IN_PROGRESS"] } },
          select: { id: true, title: true, status: true, tenant: { select: { companyName: true } } },
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
          take: LIST_LIMIT,
        }),
        [] as Array<{ id: string; title: string; status: string; tenant: { companyName: string } }>,
      ),
      safe(
        "admin.ops.tasks",
        db.task.findMany({
          where: {
            status: { in: ["NEW", "IN_PROGRESS"] },
            OR: [
              { buildingId: { in: visibleBuildingIds } },
              { buildingId: null, createdBy: { organizationId: orgId } },
            ],
          },
          select: { id: true, title: true, status: true, dueDate: true },
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
          take: LIST_LIMIT,
        }),
        [] as Array<{ id: string; title: string; status: string; dueDate: Date | null }>,
      ),
      safe(
        "admin.ops.signatureContracts",
        db.contract.findMany({
          where: {
            tenant: tenantInVisibleBuildings,
            status: { in: ["SENT", "VIEWED", "SIGNED_BY_TENANT"] },
          },
          select: { id: true, number: true, status: true, tenant: { select: { id: true, companyName: true } } },
          orderBy: [{ sentAt: "asc" }, { createdAt: "asc" }],
          take: LIST_LIMIT,
        }),
        [] as Array<{ id: string; number: string; status: string; tenant: { id: string; companyName: string } }>,
      ),
      safe(
        "admin.ops.expiringTenants",
        db.tenant.findMany({
          where: { ...tenantInVisibleBuildings, contractEnd: { gte: today, lte: in30Days } },
          select: { id: true, companyName: true, contractEnd: true },
          orderBy: { contractEnd: "asc" },
          take: LIST_LIMIT,
        }),
        [] as Array<{ id: string; companyName: string; contractEnd: Date | null }>,
      ),
      safe(
        "admin.ops.missingContactsCount",
        db.tenant.count({
          where: {
            ...tenantInVisibleBuildings,
            AND: [
              { OR: [{ user: { email: null } }, { user: { email: "" } }] },
              { OR: [{ user: { phone: null } }, { user: { phone: "" } }] },
            ],
          },
        }),
        0,
      ),
      safe(
        "admin.ops.noSignedContractCount",
        db.tenant.count({
          where: {
            ...tenantInVisibleBuildings,
            OR: [{ spaceId: { not: null } }, { tenantSpaces: { some: {} } }, { fullFloors: { some: {} } }],
            contracts: { none: { status: "SIGNED" } },
          },
        }),
        0,
      ),
      safe(
        "admin.ops.occupiedWithoutTenantCount",
        db.space.count({
          where: {
            floorId: { in: floorIds },
            kind: "RENTABLE",
            status: "OCCUPIED",
            tenant: { is: null },
            tenantSpaces: { none: {} },
          },
        }),
        0,
      ),
    ])

    const qualityCount = missingContactsCount + noSignedContractCount + occupiedWithoutTenantCount

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Сегодня</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Операционный экран администратора: деньги, документы, заявки, задачи и качество данных.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            href="/admin/finances?filter=overdue"
            icon={AlertTriangle}
            title="Просрочка"
            value={overdueAgg._count._all > 0 ? formatMoney(overdueAgg._sum.amount ?? 0) : "Нет"}
            sub={`${overdueAgg._count._all} начислений`}
            tone={overdueAgg._count._all > 0 ? "red" : "emerald"}
          />
          <MetricCard
            href="/admin/finances"
            icon={Wallet}
            title="Оплаты на проверке"
            value={paymentReportsAgg._count._all > 0 ? formatMoney(paymentReportsAgg._sum.amount ?? 0) : "Нет"}
            sub={`${paymentReportsAgg._count._all} заявок`}
            tone={paymentReportsAgg._count._all > 0 ? "amber" : "emerald"}
          />
          <MetricCard
            href="/admin/documents"
            icon={FileSignature}
            title="Документы на подпись"
            value={String(signatureContracts.length)}
            sub="ожидают действия"
            tone={signatureContracts.length > 0 ? "blue" : "emerald"}
          />
          <MetricCard
            href="/admin/data-quality"
            icon={ShieldCheck}
            title="Качество данных"
            value={qualityCount > 0 ? String(qualityCount) : "OK"}
            sub="контрольных замечаний"
            tone={qualityCount > 0 ? "amber" : "emerald"}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <WorkQueue
            title="Сначала деньги"
            description="Просрочки и оплаты на проверке напрямую влияют на долг и отчетность."
            primaryHref="/admin/finances"
            primaryLabel="Открыть финансы"
            rows={[
              ...overdueCharges.map((charge) => ({
                href: `/admin/tenants/${charge.tenant.id}`,
                title: charge.tenant.companyName,
                meta: `Просрочка ${charge.dueDate ? charge.dueDate.toLocaleDateString("ru-RU") : "без срока"}`,
                value: formatMoney(charge.amount),
              })),
              ...paymentReports.map((report) => ({
                href: `/admin/finances`,
                title: report.tenant.companyName,
                meta: report.status === "DISPUTED" ? "Спорная оплата" : "Чек на проверке",
                value: formatMoney(report.amount),
              })),
            ]}
            empty="Просрочек и чеков на проверке нет."
          />

          <WorkQueue
            title="Документы и договоры"
            description="Подписи, окончания договоров и продления лучше не оставлять на последний день."
            primaryHref="/admin/documents"
            primaryLabel="Открыть документы"
            rows={[
              ...signatureContracts.map((contract) => ({
                href: `/admin/tenants/${contract.tenant.id}`,
                title: contract.tenant.companyName,
                meta: `Документ № ${contract.number} · ${contract.status}`,
                value: "подпись",
              })),
              ...expiringTenants.map((tenant) => ({
                href: `/admin/tenants/${tenant.id}`,
                title: tenant.companyName,
                meta: `Договор до ${tenant.contractEnd ? tenant.contractEnd.toLocaleDateString("ru-RU") : "не указано"}`,
                value: "30 дн.",
              })),
            ]}
            empty="Документов на подпись и договоров к окончанию нет."
          />

          <WorkQueue
            title="Заявки арендаторов"
            description="Открытые заявки и задачи показывают реальную нагрузку обслуживания."
            primaryHref="/admin/requests"
            primaryLabel="Открыть заявки"
            rows={requests.map((request) => ({
              href: `/admin/requests/${request.id}`,
              title: request.title,
              meta: `${request.tenant.companyName} · ${request.status}`,
              value: "заявка",
            }))}
            empty="Открытых заявок нет."
          />

          <WorkQueue
            title="Задачи команды"
            description="То, что нужно закрыть сотрудникам по объектам и внутренним процессам."
            primaryHref="/admin/tasks"
            primaryLabel="Открыть задачи"
            rows={tasks.map((task) => ({
              href: "/admin/tasks",
              title: task.title,
              meta: task.dueDate ? `Срок ${task.dueDate.toLocaleDateString("ru-RU")} · ${task.status}` : task.status,
              value: "задача",
            }))}
            empty="Открытых задач нет."
          />
        </div>
      </div>
    )
  })
}

function MetricCard({
  href,
  icon: Icon,
  title,
  value,
  sub,
  tone,
}: {
  href: string
  icon: typeof AlertTriangle
  title: string
  value: string
  sub: string
  tone: "red" | "amber" | "blue" | "emerald"
}) {
  const tones = {
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  }

  return (
    <Link href={href} className={`rounded-xl border p-4 transition hover:shadow-sm ${tones[tone]}`}>
      <Icon className="h-5 w-5" />
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs opacity-80">{sub}</p>
    </Link>
  )
}

function WorkQueue({
  title,
  description,
  primaryHref,
  primaryLabel,
  rows,
  empty,
}: {
  title: string
  description: string
  primaryHref: string
  primaryLabel: string
  rows: Array<{ href: string; title: string; meta: string; value: string }>
  empty: string
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <Link href={primaryHref} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-300">
          {primaryLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {rows.length > 0 ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.slice(0, LIST_LIMIT).map((row, index) => (
            <Link key={`${row.href}-${index}`} href={row.href} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">{row.title}</span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{row.meta}</span>
              </span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {row.value}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="p-5 text-sm text-slate-500 dark:text-slate-400">{empty}</div>
      )}
    </section>
  )
}
