export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  Info,
} from "lucide-react"
import type { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { requireSection } from "@/lib/acl"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { formatDate, formatMoney } from "@/lib/utils"

type Severity = "critical" | "warning" | "info"

type IssueItem = {
  id: string
  label: string
  meta: string
  href: string
}

type QualityIssue = {
  key: string
  title: string
  description: string
  severity: Severity
  count: number
  actionLabel: string
  href: string
  items: IssueItem[]
}

const SAMPLE_LIMIT = 8

const severityMeta = {
  critical: {
    label: "Критично",
    icon: AlertTriangle,
    pill: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    iconBox: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
  },
  warning: {
    label: "Внимание",
    icon: CircleAlert,
    pill: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    iconBox: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
  },
  info: {
    label: "Контроль",
    icon: Info,
    pill: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
    iconBox: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
  },
} as const

function tenantPlace(tenant: {
  space: { number: string } | null
  fullFloors: Array<{ name: string }>
}) {
  if (tenant.space) return `Каб. ${tenant.space.number}`
  if (tenant.fullFloors.length > 0) return tenant.fullFloors.map((floor) => floor.name).join(", ")
  return "Без помещения"
}

function tenantHref(id: string) {
  return `/admin/tenants/${id}`
}

export default async function DataQualityPage() {
  await requireSection("analytics", "view")
  const { orgId } = await requireOrgAccess()

  const buildingId = await getCurrentBuildingId().catch(() => null)
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)

  const building = buildingId
    ? await db.building.findUnique({
        where: { id: buildingId },
        select: { id: true, name: true },
      })
    : null

  const floorScope: Prisma.FloorWhereInput = buildingId
    ? { buildingId }
    : { building: { organizationId: orgId } }

  const tenantScope: Prisma.TenantWhereInput = buildingId
    ? {
        user: { organizationId: orgId },
        OR: [
          { space: { floor: { buildingId } } },
          { fullFloors: { some: { buildingId } } },
        ],
      }
    : { user: { organizationId: orgId } }

  const tenantSelect = {
    id: true,
    companyName: true,
    customRate: true,
    fixedMonthlyRent: true,
    contractEnd: true,
    user: { select: { email: true, phone: true } },
    space: { select: { number: true } },
    fullFloors: { select: { name: true } },
  } satisfies Prisma.TenantSelect

  const doubleRentWhere: Prisma.TenantWhereInput = {
    ...tenantScope,
    customRate: { gt: 0 },
    fixedMonthlyRent: { gt: 0 },
  }

  const missingContactWhere: Prisma.TenantWhereInput = {
    ...tenantScope,
    AND: [
      { OR: [{ user: { email: null } }, { user: { email: "" } }] },
      { OR: [{ user: { phone: null } }, { user: { phone: "" } }] },
    ],
  }

  const missingPlaceWhere: Prisma.TenantWhereInput = {
    user: { organizationId: orgId },
    spaceId: null,
    fullFloors: { none: {} },
  }

  const noSignedContractWhere: Prisma.TenantWhereInput = {
    ...tenantScope,
    OR: [{ spaceId: { not: null } }, { fullFloors: { some: {} } }],
    contracts: { none: { status: "SIGNED" } },
  }

  const signedContractMissingDatesWhere: Prisma.ContractWhereInput = {
    tenant: tenantScope,
    status: "SIGNED",
    OR: [{ startDate: null }, { endDate: null }],
  }

  const chargeMissingDueDateWhere: Prisma.ChargeWhereInput = {
    tenant: tenantScope,
    isPaid: false,
    dueDate: null,
  }

  const occupiedWithoutTenantWhere: Prisma.SpaceWhereInput = {
    kind: "RENTABLE",
    status: "OCCUPIED",
    tenant: { is: null },
    floor: { ...floorScope, fullFloorTenantId: null },
  }

  const vacantWithTenantWhere: Prisma.SpaceWhereInput = {
    kind: "RENTABLE",
    status: "VACANT",
    tenant: { isNot: null },
    floor: floorScope,
  }

  const [
    doubleRentCount,
    doubleRentItems,
    missingContactCount,
    missingContactItems,
    missingPlaceCount,
    missingPlaceItems,
    noSignedContractCount,
    noSignedContractItems,
    signedContractMissingDatesCount,
    signedContractMissingDatesItems,
    chargeMissingDueDateCount,
    chargeMissingDueDateItems,
    occupiedWithoutTenantCount,
    occupiedWithoutTenantItems,
    vacantWithTenantCount,
    vacantWithTenantItems,
    activeCashAccountsCount,
  ] = await Promise.all([
    db.tenant.count({ where: doubleRentWhere }),
    db.tenant.findMany({ where: doubleRentWhere, select: tenantSelect, take: SAMPLE_LIMIT, orderBy: { createdAt: "desc" } }),
    db.tenant.count({ where: missingContactWhere }),
    db.tenant.findMany({ where: missingContactWhere, select: tenantSelect, take: SAMPLE_LIMIT, orderBy: { createdAt: "desc" } }),
    db.tenant.count({ where: missingPlaceWhere }),
    db.tenant.findMany({ where: missingPlaceWhere, select: tenantSelect, take: SAMPLE_LIMIT, orderBy: { createdAt: "desc" } }),
    db.tenant.count({ where: noSignedContractWhere }),
    db.tenant.findMany({ where: noSignedContractWhere, select: tenantSelect, take: SAMPLE_LIMIT, orderBy: { createdAt: "desc" } }),
    db.contract.count({ where: signedContractMissingDatesWhere }),
    db.contract.findMany({
      where: signedContractMissingDatesWhere,
      select: {
        id: true,
        number: true,
        startDate: true,
        endDate: true,
        tenant: { select: { id: true, companyName: true } },
      },
      take: SAMPLE_LIMIT,
      orderBy: { createdAt: "desc" },
    }),
    db.charge.count({ where: chargeMissingDueDateWhere }),
    db.charge.findMany({
      where: chargeMissingDueDateWhere,
      select: {
        id: true,
        period: true,
        amount: true,
        type: true,
        tenant: { select: { id: true, companyName: true } },
      },
      take: SAMPLE_LIMIT,
      orderBy: { createdAt: "desc" },
    }),
    db.space.count({ where: occupiedWithoutTenantWhere }),
    db.space.findMany({
      where: occupiedWithoutTenantWhere,
      select: { id: true, number: true, area: true, floor: { select: { name: true } } },
      take: SAMPLE_LIMIT,
      orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
    }),
    db.space.count({ where: vacantWithTenantWhere }),
    db.space.findMany({
      where: vacantWithTenantWhere,
      select: {
        id: true,
        number: true,
        floor: { select: { name: true } },
        tenant: { select: { id: true, companyName: true } },
      },
      take: SAMPLE_LIMIT,
      orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
    }),
    db.cashAccount.count({ where: { organizationId: orgId, isActive: true } }),
  ])

  const issues: QualityIssue[] = [
    {
      key: "double-rent",
      title: "Два индивидуальных способа аренды",
      description: "У арендатора одновременно заполнены ставка за м² и фиксированная аренда. В расчетах должна остаться только одна логика.",
      severity: "critical",
      count: doubleRentCount,
      actionLabel: "Открыть арендатора",
      href: "/admin/tenants",
      items: doubleRentItems.map((tenant) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: `${tenantPlace(tenant)} · ставка ${formatMoney(tenant.customRate ?? 0)}/м² · фикс ${formatMoney(tenant.fixedMonthlyRent ?? 0)}/мес`,
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "missing-contact",
      title: "Арендатор без телефона и email",
      description: "Такой арендатор не сможет нормально войти в кабинет, получить счет, уведомление или ссылку на подпись.",
      severity: "critical",
      count: missingContactCount,
      actionLabel: "Заполнить контакт",
      href: "/admin/tenants",
      items: missingContactItems.map((tenant) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: `${tenantPlace(tenant)} · нет телефона и email`,
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "vacant-with-tenant",
      title: "Помещение свободно, но к нему привязан арендатор",
      description: "Статус помещения противоречит карточке арендатора. Это ломает заполняемость и прогноз аренды.",
      severity: "critical",
      count: vacantWithTenantCount,
      actionLabel: "Проверить помещение",
      href: "/admin/spaces",
      items: vacantWithTenantItems.map((space) => ({
        id: space.id,
        label: `Каб. ${space.number}`,
        meta: `${space.floor.name} · арендатор ${space.tenant?.companyName ?? "не указан"}`,
        href: space.tenant ? tenantHref(space.tenant.id) : "/admin/spaces",
      })),
    },
    {
      key: "missing-place",
      title: "Арендатор без помещения или этажа",
      description: "Без помещения система не может корректно считать аренду, договоры, счета и заявки по объекту.",
      severity: "warning",
      count: missingPlaceCount,
      actionLabel: "Назначить помещение",
      href: "/admin/tenants",
      items: missingPlaceItems.map((tenant) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: "По всей организации · помещение не назначено",
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "occupied-without-tenant",
      title: "Помещение занято, но арендатор не привязан",
      description: "Помещение выглядит занятым, хотя карточки арендатора нет. Если это не аренда целого этажа, статус нужно исправить.",
      severity: "warning",
      count: occupiedWithoutTenantCount,
      actionLabel: "Открыть помещения",
      href: "/admin/spaces",
      items: occupiedWithoutTenantItems.map((space) => ({
        id: space.id,
        label: `Каб. ${space.number}`,
        meta: `${space.floor.name} · ${space.area} м² · нет арендатора`,
        href: "/admin/spaces",
      })),
    },
    {
      key: "no-signed-contract",
      title: "Арендатор без подписанного договора",
      description: "Начисления и изменения условий лучше подкреплять подписанным договором или доп. соглашением.",
      severity: "warning",
      count: noSignedContractCount,
      actionLabel: "Создать договор",
      href: "/admin/tenants",
      items: noSignedContractItems.map((tenant) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: `${tenantPlace(tenant)} · подписанного договора нет`,
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "signed-contract-missing-dates",
      title: "Подписанный договор без дат",
      description: "У подписанного договора должна быть дата начала и окончания, иначе нельзя надежно строить продления и напоминания.",
      severity: "warning",
      count: signedContractMissingDatesCount,
      actionLabel: "Открыть договор",
      href: "/admin/contracts",
      items: signedContractMissingDatesItems.map((contract) => ({
        id: contract.id,
        label: `Договор № ${contract.number}`,
        meta: `${contract.tenant.companyName} · начало ${contract.startDate ? formatDate(contract.startDate) : "не указано"} · конец ${contract.endDate ? formatDate(contract.endDate) : "не указан"}`,
        href: tenantHref(contract.tenant.id),
      })),
    },
    {
      key: "charge-missing-due-date",
      title: "Неоплаченный счет без срока оплаты",
      description: "Без due date система не может корректно подсвечивать просрочки и начислять пеню.",
      severity: "warning",
      count: chargeMissingDueDateCount,
      actionLabel: "Проверить финансы",
      href: "/admin/finances",
      items: chargeMissingDueDateItems.map((charge) => ({
        id: charge.id,
        label: `${charge.tenant.companyName} · ${formatMoney(charge.amount)}`,
        meta: `${charge.period} · ${charge.type} · срок оплаты не указан`,
        href: tenantHref(charge.tenant.id),
      })),
    },
    {
      key: "cash-accounts",
      title: "Не настроен активный счет или касса",
      description: "Без счета платежи можно принять вручную, но баланс, сверка и импорт банка будут менее надежными.",
      severity: "info",
      count: activeCashAccountsCount === 0 ? 1 : 0,
      actionLabel: "Добавить счет",
      href: "/admin/finances/balance",
      items: activeCashAccountsCount === 0
        ? [{
            id: "cash-accounts",
            label: "Активные счета не найдены",
            meta: "Добавьте банковский счет, карту или кассу организации",
            href: "/admin/finances/balance",
          }]
        : [],
    },
  ]

  const activeIssues = issues
    .filter((issue) => issue.count > 0)
    .sort((a, b) => {
      const rank = { critical: 0, warning: 1, info: 2 }
      return rank[a.severity] - rank[b.severity] || b.count - a.count
    })

  const criticalCount = issues.filter((issue) => issue.severity === "critical").reduce((sum, issue) => sum + issue.count, 0)
  const warningCount = issues.filter((issue) => issue.severity === "warning").reduce((sum, issue) => sum + issue.count, 0)
  const infoCount = issues.filter((issue) => issue.severity === "info").reduce((sum, issue) => sum + issue.count, 0)
  const totalCount = criticalCount + warningCount + infoCount

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Качество данных</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {building ? `Проверка по зданию ${building.name}` : "Проверка по всей организации"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Всего проблем" value={totalCount} tone={totalCount > 0 ? "slate" : "emerald"} />
        <SummaryCard label="Критично" value={criticalCount} tone="red" />
        <SummaryCard label="Внимание" value={warningCount} tone="amber" />
        <SummaryCard label="Контроль" value={infoCount} tone="blue" />
      </div>

      {activeIssues.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-300" />
          <h2 className="mt-3 text-lg font-semibold text-emerald-950 dark:text-emerald-100">Критичных проблем не найдено</h2>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200">
            Можно продолжать работу: арендаторы, помещения, договоры и счета проходят базовые проверки качества.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {activeIssues.map((issue) => (
            <IssueCard key={issue.key} issue={issue} />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "slate" | "red" | "amber" | "blue" | "emerald" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  }

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{label}</p>
    </div>
  )
}

function IssueCard({ issue }: { issue: QualityIssue }) {
  const meta = severityMeta[issue.severity]
  const Icon = meta.icon

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 p-5 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.iconBox}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{issue.title}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}>
                {meta.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{issue.description}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{issue.count}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">найдено</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {issue.items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{item.label}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.meta}</span>
            </span>
            <ExternalLink className="h-4 w-4 shrink-0 text-slate-300" />
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <Link href={issue.href} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300">
          {issue.actionLabel}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        {issue.count > issue.items.length && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Показано {issue.items.length} из {issue.count}
          </span>
        )}
      </div>
    </section>
  )
}
