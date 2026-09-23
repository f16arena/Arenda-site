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
import { getT, getLocale } from "@/lib/i18n/server"
import { formatDateL, formatMoneyL } from "@/lib/i18n/format"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import {
  ACTION_CAPABILITIES,
  CAPABILITY_PERMISSION_PREFIX,
  capabilityLabel,
  capabilityPermissionKey,
} from "@/lib/capabilities"
import { normalizeEmail, normalizeKzPhone } from "@/lib/contact-validation"
import { userCapabilityRole } from "@/lib/capability-keys"
import { canManageRoleInOrg, displayRoleLabel, isStaffLikeRole } from "@/lib/role-capabilities"
import { getRelationshipIntegrityOverview } from "@/lib/relationship-integrity"
import { RelationshipIntegrityPanelLazy } from "./relationship-integrity-panel-lazy"
import { PageHeader, StatCard } from "@/components/ui/page"
import { RouteTabs } from "@/components/ui/route-tabs"
import { healthTabs } from "@/lib/hub-tabs"

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
  /** Подпись важности («Критично» / «Внимание» / «Контроль») — уже на языке страницы. */
  severityLabel: string
  count: number
  actionLabel: string
  href: string
  items: IssueItem[]
}

const SAMPLE_LIMIT = 8

// Только оформление: подписи важности берём из словаря
// (adminSettings.dataQuality.severity) — ключ совпадает с важностью.
const severityMeta = {
  critical: {
    icon: AlertTriangle,
    pill: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    iconBox: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
  },
  warning: {
    icon: CircleAlert,
    pill: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    iconBox: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
  },
  info: {
    icon: Info,
    pill: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
    iconBox: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
  },
} as const

function tenantHref(id: string) {
  return `/admin/tenants/${id}`
}

/** Контакт непригоден: возвращаем сами значения, подписи к ним — на странице. */
function invalidContactValues(tenant: {
  user: {
    email: string | null
    phone: string | null
  }
}) {
  const phone = (() => {
    if (!tenant.user.phone) return null
    try {
      normalizeKzPhone(tenant.user.phone)
      return null
    } catch {
      return tenant.user.phone
    }
  })()

  const email = (() => {
    if (!tenant.user.email) return null
    try {
      normalizeEmail(tenant.user.email)
      return null
    } catch {
      return tenant.user.email
    }
  })()

  return { phone, email }
}

function isHighRiskCapability(capability: { level: string; risk?: string | null }) {
  return capability.level === "sensitive" || capability.risk === "business" || capability.risk === "sensitive"
}

export default async function DataQualityPage() {
  await requireSection("analytics", "view")
  const { orgId } = await requireOrgAccess()

  const locale = await getLocale()
  const { t } = await getT(locale)
  const money = (amount: number) => formatMoneyL(locale, amount)
  const date = (value: Date) => formatDateL(locale, value)
  // Вид начисления из базы — строка: нет в словаре, показываем как есть.
  const chargeTypeLabel = (type: string) => {
    const key = `domain.chargeTypes.${type}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? type : label
  }
  // Где сидит арендатор: помещение, несколько помещений или целые этажи.
  const tenantPlace = (tenant: {
    space: { number: string } | null
    tenantSpaces: Array<{ space: { number: string } }>
    fullFloors: Array<{ name: string }>
  }) => {
    if (tenant.space) return t("adminSettings.dataQuality.spaceShort", { number: tenant.space.number })
    if (tenant.tenantSpaces.length > 0) {
      return tenant.tenantSpaces
        .map((item) => t("adminSettings.dataQuality.spaceShort", { number: item.space.number }))
        .join(", ")
    }
    if (tenant.fullFloors.length > 0) return tenant.fullFloors.map((floor) => floor.name).join(", ")
    return t("adminSettings.dataQuality.noSpace")
  }

  const buildingId = await getCurrentBuildingId().catch(() => null)
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const stalePaymentReportDate = new Date(today)
  stalePaymentReportDate.setDate(today.getDate() - 2)

  const building = buildingId
    ? await db.building.findUnique({
        where: { id: buildingId },
        select: { id: true, name: true },
      })
    : null

  const floorScope: Prisma.FloorWhereInput = buildingId
    ? { buildingId }
    : { buildingId: { in: visibleBuildingIds } }

  const tenantScope: Prisma.TenantWhereInput = {
    user: { organizationId: orgId },
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: visibleBuildingIds } } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
      { buildingId: { in: visibleBuildingIds } },
    ],
  }

  const tenantSelect = {
    id: true,
    companyName: true,
    customRate: true,
    fixedMonthlyRent: true,
    contractEnd: true,
    user: { select: { email: true, phone: true } },
    space: { select: { number: true } },
    tenantSpaces: { select: { space: { select: { number: true } } }, take: 3 },
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
    tenantSpaces: { none: {} },
    fullFloors: { none: {} },
  }

  const noSignedContractWhere: Prisma.TenantWhereInput = {
    // AND, не spread: второй OR затирал OR «здания пользователя» из tenantScope.
    AND: [tenantScope, { OR: [{ spaceId: { not: null } }, { tenantSpaces: { some: {} } }, { fullFloors: { some: {} } }] }],
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

  const overdueChargeWhere: Prisma.ChargeWhereInput = {
    tenant: tenantScope,
    isPaid: false,
    dueDate: { lt: today },
  }

  const expiredContractWhere: Prisma.TenantWhereInput = {
    AND: [tenantScope, { OR: [{ spaceId: { not: null } }, { tenantSpaces: { some: {} } }, { fullFloors: { some: {} } }] }],
    contractEnd: { lt: today },
  }

  const invalidPaymentRulesWhere: Prisma.TenantWhereInput = {
    AND: [tenantScope, { OR: [
      { paymentDueDay: { lt: 1 } },
      { paymentDueDay: { gt: 31 } },
      { penaltyPercent: { lt: 0 } },
    ] }],
  }

  const highRiskCapabilityByPermission = new Map(
    ACTION_CAPABILITIES
      .filter(isHighRiskCapability)
      .map((capability) => [capabilityPermissionKey(capability.key), capability]),
  )

  const pendingPaymentReportWhere: Prisma.PaymentReportWhereInput = {
    tenant: tenantScope,
    status: "PENDING",
    createdAt: { lt: stalePaymentReportDate },
  }

  const occupiedWithoutTenantWhere: Prisma.SpaceWhereInput = {
    kind: "RENTABLE",
    status: "OCCUPIED",
    tenant: { is: null },
    tenantSpaces: { none: {} },
    floor: { ...floorScope, fullFloorTenantId: null },
  }

  const vacantWithTenantWhere: Prisma.SpaceWhereInput = {
    kind: "RENTABLE",
    status: "VACANT",
    OR: [{ tenant: { isNot: null } }, { tenantSpaces: { some: {} } }],
    floor: floorScope,
  }

  const relationshipIntegrityPromise = getRelationshipIntegrityOverview({
    orgId,
    buildingId,
    visibleBuildingIds,
    sampleLimit: SAMPLE_LIMIT,
  })

  const invalidRentableSpaceAreaWhere: Prisma.SpaceWhereInput = {
    kind: "RENTABLE",
    area: { lte: 0 },
    floor: floorScope,
  }

  const floorWithoutPricingWhere: Prisma.FloorWhereInput = {
    ...floorScope,
    ratePerSqm: { lte: 0 },
    fixedMonthlyRent: null,
    spaces: { some: { kind: "RENTABLE" } },
  }

  const [
    doubleRentCount,
    doubleRentItems,
    contactCheckCandidates,
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
    overdueChargeCount,
    overdueChargeItems,
    expiredContractCount,
    expiredContractItems,
    invalidPaymentRulesCount,
    invalidPaymentRulesItems,
    pendingPaymentReportCount,
    pendingPaymentReportItems,
    occupiedWithoutTenantCount,
    occupiedWithoutTenantItems,
    vacantWithTenantCount,
    vacantWithTenantItems,
    invalidRentableSpaceAreaCount,
    invalidRentableSpaceAreaItems,
    floorWithoutPricingCount,
    floorWithoutPricingItems,
    activeCashAccountsCount,
    accessUsers,
    roleCapabilityRows,
    relationshipIntegrity,
  ] = await Promise.all([
    db.tenant.count({ where: doubleRentWhere }),
    db.tenant.findMany({ where: doubleRentWhere, select: tenantSelect, take: SAMPLE_LIMIT, orderBy: { createdAt: "desc" } }),
    db.tenant.findMany({ where: tenantScope, select: tenantSelect, orderBy: { createdAt: "desc" } }),
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
    db.charge.count({ where: overdueChargeWhere }),
    db.charge.findMany({
      where: overdueChargeWhere,
      select: {
        id: true,
        period: true,
        amount: true,
        dueDate: true,
        type: true,
        tenant: { select: { id: true, companyName: true } },
      },
      take: SAMPLE_LIMIT,
      orderBy: { dueDate: "asc" },
    }),
    db.tenant.count({ where: expiredContractWhere }),
    db.tenant.findMany({ where: expiredContractWhere, select: tenantSelect, take: SAMPLE_LIMIT, orderBy: { contractEnd: "asc" } }),
    db.tenant.count({ where: invalidPaymentRulesWhere }),
    db.tenant.findMany({
      where: invalidPaymentRulesWhere,
      select: {
        ...tenantSelect,
        paymentDueDay: true,
        penaltyPercent: true,
      },
      take: SAMPLE_LIMIT,
      orderBy: { createdAt: "desc" },
    }),
    db.paymentReport.count({ where: pendingPaymentReportWhere }),
    db.paymentReport.findMany({
      where: pendingPaymentReportWhere,
      select: {
        id: true,
        amount: true,
        createdAt: true,
        tenant: { select: { id: true, companyName: true } },
      },
      take: SAMPLE_LIMIT,
      orderBy: { createdAt: "asc" },
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
    db.space.count({ where: invalidRentableSpaceAreaWhere }),
    db.space.findMany({
      where: invalidRentableSpaceAreaWhere,
      select: { id: true, number: true, area: true, floor: { select: { name: true } } },
      take: SAMPLE_LIMIT,
      orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
    }),
    db.floor.count({ where: floorWithoutPricingWhere }),
    db.floor.findMany({
      where: floorWithoutPricingWhere,
      select: { id: true, name: true, ratePerSqm: true, fixedMonthlyRent: true, building: { select: { name: true } } },
      take: SAMPLE_LIMIT,
      orderBy: [{ building: { createdAt: "asc" } }, { number: "asc" }],
    }),
    db.cashAccount.count({ where: { organizationId: orgId, isActive: true } }),
    db.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        buildingAccess: { select: { building: { select: { name: true } } } },
        administeredBuildings: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.rolePermission.findMany({
      where: { organizationId: orgId, section: { startsWith: CAPABILITY_PERMISSION_PREFIX } },
      select: { role: true, section: true, canView: true, canEdit: true },
    }).catch(() => [] as Array<{ role: string; section: string; canView: boolean; canEdit: boolean }>),
    relationshipIntegrityPromise,
  ])

  const invalidContactItemsAll = contactCheckCandidates
    .map((tenant) => {
      const invalid = invalidContactValues(tenant)
      const reasons = [
        ...(invalid.phone ? [t("adminSettings.dataQuality.reasonPhone", { value: invalid.phone })] : []),
        ...(invalid.email ? [t("adminSettings.dataQuality.reasonEmail", { value: invalid.email })] : []),
      ]
      return { tenant, reasons }
    })
    .filter((item) => item.reasons.length > 0)
  const accessUserByOverrideRole = new Map(accessUsers.map((user) => [userCapabilityRole(user.id), user]))
  const staffWithoutBuildingAccessItems = accessUsers
    .filter((user) => (
      isStaffLikeRole(user.role)
      && user.buildingAccess.length === 0
      && user.administeredBuildings.length === 0
    ))
  const highRiskRoleCapabilityItems = roleCapabilityRows
    .map((row) => ({
      row,
      capability: highRiskCapabilityByPermission.get(row.section),
    }))
    .filter(({ row, capability }) => (
      !!capability
      && !row.role.startsWith("user:")
      && isStaffLikeRole(row.role)
      && canManageRoleInOrg(row.role, orgId)
      && (row.canView || row.canEdit)
    ))
  const personalCapabilityOverrideItems = roleCapabilityRows
    .map((row) => ({
      row,
      user: accessUserByOverrideRole.get(row.role),
      capability: ACTION_CAPABILITIES.find((capability) => capabilityPermissionKey(capability.key) === row.section),
    }))
    .filter(({ user, capability }) => !!user && !!capability)

  // Проверки качества: тексты — в словаре (adminSettings.dataQuality.issues),
  // здесь только условия, счётчики и примеры записей.
  const issues: QualityIssue[] = [
    {
      key: "double-rent",
      title: t("adminSettings.dataQuality.issues.doubleRent.title"),
      description: t("adminSettings.dataQuality.issues.doubleRent.description"),
      severity: "critical",
      severityLabel: t("adminSettings.dataQuality.severity.critical"),
      count: doubleRentCount,
      actionLabel: t("adminSettings.dataQuality.issues.doubleRent.action"),
      href: "/admin/tenants",
      items: doubleRentItems.map((tenant) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: t("adminSettings.dataQuality.issues.doubleRent.meta", {
          place: tenantPlace(tenant),
          rate: money(tenant.customRate ?? 0),
          fixed: money(tenant.fixedMonthlyRent ?? 0),
        }),
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "missing-contact",
      title: t("adminSettings.dataQuality.issues.missingContact.title"),
      description: t("adminSettings.dataQuality.issues.missingContact.description"),
      severity: "critical",
      severityLabel: t("adminSettings.dataQuality.severity.critical"),
      count: missingContactCount,
      actionLabel: t("adminSettings.dataQuality.issues.missingContact.action"),
      href: "/admin/tenants",
      items: missingContactItems.map((tenant) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: t("adminSettings.dataQuality.issues.missingContact.meta", { place: tenantPlace(tenant) }),
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "invalid-contact",
      title: t("adminSettings.dataQuality.issues.invalidContact.title"),
      description: t("adminSettings.dataQuality.issues.invalidContact.description"),
      severity: "critical",
      severityLabel: t("adminSettings.dataQuality.severity.critical"),
      count: invalidContactItemsAll.length,
      actionLabel: t("adminSettings.dataQuality.issues.invalidContact.action"),
      href: "/admin/tenants",
      items: invalidContactItemsAll.slice(0, SAMPLE_LIMIT).map(({ tenant, reasons }) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: t("adminSettings.dataQuality.issues.invalidContact.meta", {
          place: tenantPlace(tenant),
          reasons: reasons.join(" · "),
        }),
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "staff-without-building-access",
      title: t("adminSettings.dataQuality.issues.staffWithoutBuildings.title"),
      description: t("adminSettings.dataQuality.issues.staffWithoutBuildings.description"),
      severity: "warning",
      severityLabel: t("adminSettings.dataQuality.severity.warning"),
      count: staffWithoutBuildingAccessItems.length,
      actionLabel: t("adminSettings.dataQuality.issues.staffWithoutBuildings.action"),
      href: "/admin/users",
      items: staffWithoutBuildingAccessItems.slice(0, SAMPLE_LIMIT).map((user) => ({
        id: user.id,
        label: user.name,
        meta: t("adminSettings.dataQuality.issues.staffWithoutBuildings.meta", { role: displayRoleLabel(user.role) }),
        href: "/admin/users",
      })),
    },
    {
      key: "high-risk-role-capabilities",
      title: t("adminSettings.dataQuality.issues.highRiskRoleCaps.title"),
      description: t("adminSettings.dataQuality.issues.highRiskRoleCaps.description"),
      severity: "info",
      severityLabel: t("adminSettings.dataQuality.severity.info"),
      count: highRiskRoleCapabilityItems.length,
      actionLabel: t("adminSettings.dataQuality.issues.highRiskRoleCaps.action"),
      href: "/admin/roles",
      items: highRiskRoleCapabilityItems.slice(0, SAMPLE_LIMIT).map(({ row, capability }) => ({
        id: `${row.role}:${row.section}`,
        label: displayRoleLabel(row.role),
        meta: t("adminSettings.dataQuality.issues.highRiskRoleCaps.meta", {
          capability: capability ? capabilityLabel(t, capability) : row.section,
          mode: row.canEdit
            ? t("adminSettings.dataQuality.issues.highRiskRoleCaps.modeFull")
            : t("adminSettings.dataQuality.issues.highRiskRoleCaps.modeView"),
        }),
        href: "/admin/roles",
      })),
    },
    {
      key: "personal-capability-overrides",
      title: t("adminSettings.dataQuality.issues.personalOverrides.title"),
      description: t("adminSettings.dataQuality.issues.personalOverrides.description"),
      severity: "info",
      severityLabel: t("adminSettings.dataQuality.severity.info"),
      count: personalCapabilityOverrideItems.length,
      actionLabel: t("adminSettings.dataQuality.issues.personalOverrides.action"),
      href: "/admin/users",
      items: personalCapabilityOverrideItems.slice(0, SAMPLE_LIMIT).map(({ row, user, capability }) => ({
        id: `${row.role}:${row.section}`,
        label: user?.name ?? t("adminSettings.dataQuality.issues.personalOverrides.someUser"),
        meta: t("adminSettings.dataQuality.issues.personalOverrides.meta", {
          capability: capability ? capabilityLabel(t, capability) : row.section,
          mode: row.canView || row.canEdit
            ? t("adminSettings.dataQuality.issues.personalOverrides.modeAllow")
            : t("adminSettings.dataQuality.issues.personalOverrides.modeDeny"),
        }),
        href: "/admin/users",
      })),
    },
    {
      key: "vacant-with-tenant",
      title: t("adminSettings.dataQuality.issues.vacantWithTenant.title"),
      description: t("adminSettings.dataQuality.issues.vacantWithTenant.description"),
      severity: "critical",
      severityLabel: t("adminSettings.dataQuality.severity.critical"),
      count: vacantWithTenantCount,
      actionLabel: t("adminSettings.dataQuality.issues.vacantWithTenant.action"),
      href: "/admin/spaces",
      items: vacantWithTenantItems.map((space) => ({
        id: space.id,
        label: t("adminSettings.dataQuality.spaceShort", { number: space.number }),
        meta: t("adminSettings.dataQuality.issues.vacantWithTenant.meta", {
          floor: space.floor.name,
          tenant: space.tenant?.companyName ?? t("adminSettings.dataQuality.notSpecifiedM"),
        }),
        href: space.tenant ? tenantHref(space.tenant.id) : "/admin/spaces",
      })),
    },
    {
      key: "missing-place",
      title: t("adminSettings.dataQuality.issues.missingPlace.title"),
      description: t("adminSettings.dataQuality.issues.missingPlace.description"),
      severity: "warning",
      severityLabel: t("adminSettings.dataQuality.severity.warning"),
      count: missingPlaceCount,
      actionLabel: t("adminSettings.dataQuality.issues.missingPlace.action"),
      href: "/admin/tenants",
      items: missingPlaceItems.map((tenant) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: t("adminSettings.dataQuality.issues.missingPlace.meta"),
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "occupied-without-tenant",
      title: t("adminSettings.dataQuality.issues.occupiedWithoutTenant.title"),
      description: t("adminSettings.dataQuality.issues.occupiedWithoutTenant.description"),
      severity: "warning",
      severityLabel: t("adminSettings.dataQuality.severity.warning"),
      count: occupiedWithoutTenantCount,
      actionLabel: t("adminSettings.dataQuality.issues.occupiedWithoutTenant.action"),
      href: "/admin/spaces",
      items: occupiedWithoutTenantItems.map((space) => ({
        id: space.id,
        label: t("adminSettings.dataQuality.spaceShort", { number: space.number }),
        meta: t("adminSettings.dataQuality.issues.occupiedWithoutTenant.meta", {
          floor: space.floor.name,
          area: space.area,
        }),
        href: "/admin/spaces",
      })),
    },
    {
      key: "no-signed-contract",
      title: t("adminSettings.dataQuality.issues.noSignedContract.title"),
      description: t("adminSettings.dataQuality.issues.noSignedContract.description"),
      severity: "warning",
      severityLabel: t("adminSettings.dataQuality.severity.warning"),
      count: noSignedContractCount,
      actionLabel: t("adminSettings.dataQuality.issues.noSignedContract.action"),
      href: "/admin/tenants",
      items: noSignedContractItems.map((tenant) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: t("adminSettings.dataQuality.issues.noSignedContract.meta", { place: tenantPlace(tenant) }),
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "signed-contract-missing-dates",
      title: t("adminSettings.dataQuality.issues.contractMissingDates.title"),
      description: t("adminSettings.dataQuality.issues.contractMissingDates.description"),
      severity: "warning",
      severityLabel: t("adminSettings.dataQuality.severity.warning"),
      count: signedContractMissingDatesCount,
      actionLabel: t("adminSettings.dataQuality.issues.contractMissingDates.action"),
      href: "/admin/contracts",
      items: signedContractMissingDatesItems.map((contract) => ({
        id: contract.id,
        label: t("adminSettings.dataQuality.contractNumber", { number: contract.number }),
        meta: t("adminSettings.dataQuality.issues.contractMissingDates.meta", {
          tenant: contract.tenant.companyName,
          start: contract.startDate ? date(contract.startDate) : t("adminSettings.dataQuality.notSpecified"),
          end: contract.endDate ? date(contract.endDate) : t("adminSettings.dataQuality.notSpecifiedM"),
        }),
        href: tenantHref(contract.tenant.id),
      })),
    },
    {
      key: "charge-missing-due-date",
      title: t("adminSettings.dataQuality.issues.chargeMissingDueDate.title"),
      description: t("adminSettings.dataQuality.issues.chargeMissingDueDate.description"),
      severity: "warning",
      severityLabel: t("adminSettings.dataQuality.severity.warning"),
      count: chargeMissingDueDateCount,
      actionLabel: t("adminSettings.dataQuality.issues.chargeMissingDueDate.action"),
      href: "/admin/finances",
      items: chargeMissingDueDateItems.map((charge) => ({
        id: charge.id,
        label: `${charge.tenant.companyName} · ${money(charge.amount)}`,
        meta: t("adminSettings.dataQuality.issues.chargeMissingDueDate.meta", {
          period: charge.period,
          type: chargeTypeLabel(charge.type),
        }),
        href: tenantHref(charge.tenant.id),
      })),
    },
    {
      key: "overdue-charge",
      title: t("adminSettings.dataQuality.issues.overdueCharge.title"),
      description: t("adminSettings.dataQuality.issues.overdueCharge.description"),
      severity: "critical",
      severityLabel: t("adminSettings.dataQuality.severity.critical"),
      count: overdueChargeCount,
      actionLabel: t("adminSettings.dataQuality.issues.overdueCharge.action"),
      href: "/admin/finances",
      items: overdueChargeItems.map((charge) => ({
        id: charge.id,
        label: `${charge.tenant.companyName} · ${money(charge.amount)}`,
        meta: t("adminSettings.dataQuality.issues.overdueCharge.meta", {
          period: charge.period,
          type: chargeTypeLabel(charge.type),
          due: charge.dueDate ? date(charge.dueDate) : t("adminSettings.dataQuality.notSpecifiedM"),
        }),
        href: tenantHref(charge.tenant.id),
      })),
    },
    {
      key: "expired-contract",
      title: t("adminSettings.dataQuality.issues.expiredContract.title"),
      description: t("adminSettings.dataQuality.issues.expiredContract.description"),
      severity: "critical",
      severityLabel: t("adminSettings.dataQuality.severity.critical"),
      count: expiredContractCount,
      actionLabel: t("adminSettings.dataQuality.issues.expiredContract.action"),
      href: "/admin/tenants",
      items: expiredContractItems.map((tenant) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: t("adminSettings.dataQuality.issues.expiredContract.meta", {
          place: tenantPlace(tenant),
          date: tenant.contractEnd ? date(tenant.contractEnd) : t("adminSettings.dataQuality.notSpecified"),
        }),
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "invalid-payment-rules",
      title: t("adminSettings.dataQuality.issues.invalidPaymentRules.title"),
      description: t("adminSettings.dataQuality.issues.invalidPaymentRules.description"),
      severity: "critical",
      severityLabel: t("adminSettings.dataQuality.severity.critical"),
      count: invalidPaymentRulesCount,
      actionLabel: t("adminSettings.dataQuality.issues.invalidPaymentRules.action"),
      href: "/admin/tenants",
      items: invalidPaymentRulesItems.map((tenant) => ({
        id: tenant.id,
        label: tenant.companyName,
        meta: t("adminSettings.dataQuality.issues.invalidPaymentRules.meta", {
          place: tenantPlace(tenant),
          day: tenant.paymentDueDay,
          percent: tenant.penaltyPercent,
        }),
        href: tenantHref(tenant.id),
      })),
    },
    {
      key: "pending-payment-report",
      title: t("adminSettings.dataQuality.issues.pendingPaymentReport.title"),
      description: t("adminSettings.dataQuality.issues.pendingPaymentReport.description"),
      severity: "warning",
      severityLabel: t("adminSettings.dataQuality.severity.warning"),
      count: pendingPaymentReportCount,
      actionLabel: t("adminSettings.dataQuality.issues.pendingPaymentReport.action"),
      href: "/admin/finances",
      items: pendingPaymentReportItems.map((report) => ({
        id: report.id,
        label: `${report.tenant.companyName} · ${money(report.amount)}`,
        meta: t("adminSettings.dataQuality.issues.pendingPaymentReport.meta", { date: date(report.createdAt) }),
        href: tenantHref(report.tenant.id),
      })),
    },
    {
      key: "invalid-space-area",
      title: t("adminSettings.dataQuality.issues.invalidSpaceArea.title"),
      description: t("adminSettings.dataQuality.issues.invalidSpaceArea.description"),
      severity: "warning",
      severityLabel: t("adminSettings.dataQuality.severity.warning"),
      count: invalidRentableSpaceAreaCount,
      actionLabel: t("adminSettings.dataQuality.issues.invalidSpaceArea.action"),
      href: "/admin/spaces",
      items: invalidRentableSpaceAreaItems.map((space) => ({
        id: space.id,
        label: t("adminSettings.dataQuality.spaceShort", { number: space.number }),
        meta: t("adminSettings.dataQuality.issues.invalidSpaceArea.meta", {
          floor: space.floor.name,
          area: space.area,
        }),
        href: "/admin/spaces",
      })),
    },
    {
      key: "floor-without-pricing",
      title: t("adminSettings.dataQuality.issues.floorWithoutPricing.title"),
      description: t("adminSettings.dataQuality.issues.floorWithoutPricing.description"),
      severity: "warning",
      severityLabel: t("adminSettings.dataQuality.severity.warning"),
      count: floorWithoutPricingCount,
      actionLabel: t("adminSettings.dataQuality.issues.floorWithoutPricing.action"),
      href: "/admin/buildings",
      items: floorWithoutPricingItems.map((floor) => ({
        id: floor.id,
        label: floor.name,
        meta: t("adminSettings.dataQuality.issues.floorWithoutPricing.meta", {
          building: floor.building.name,
          rate: money(floor.ratePerSqm),
        }),
        href: "/admin/buildings",
      })),
    },
    {
      key: "cash-accounts",
      title: t("adminSettings.dataQuality.issues.cashAccounts.title"),
      description: t("adminSettings.dataQuality.issues.cashAccounts.description"),
      severity: "info",
      severityLabel: t("adminSettings.dataQuality.severity.info"),
      count: activeCashAccountsCount === 0 ? 1 : 0,
      actionLabel: t("adminSettings.dataQuality.issues.cashAccounts.action"),
      href: "/admin/finances/balance",
      items: activeCashAccountsCount === 0
        ? [{
            id: "cash-accounts",
            label: t("adminSettings.dataQuality.issues.cashAccounts.itemLabel"),
            meta: t("adminSettings.dataQuality.issues.cashAccounts.itemMeta"),
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

  const criticalCount = issues.filter((issue) => issue.severity === "critical").reduce((sum, issue) => sum + issue.count, 0) + relationshipIntegrity.summary.critical
  const warningCount = issues.filter((issue) => issue.severity === "warning").reduce((sum, issue) => sum + issue.count, 0) + relationshipIntegrity.summary.warning
  const infoCount = issues.filter((issue) => issue.severity === "info").reduce((sum, issue) => sum + issue.count, 0) + relationshipIntegrity.summary.info
  const totalCount = criticalCount + warningCount + infoCount

  return (
    <div className="space-y-5">
      <RouteTabs items={healthTabs(t)} className="mb-2" />
      <PageHeader
        icon={ClipboardCheck}
        title={t("adminSettings.dataQuality.title")}
        subtitle={building
          ? t("adminSettings.dataQuality.subtitleBuilding", { building: building.name })
          : t("adminSettings.dataQuality.subtitleOrg")}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={ClipboardCheck} label={t("adminSettings.dataQuality.statTotal")} value={totalCount} tone={totalCount > 0 ? "slate" : "emerald"} />
        <StatCard icon={AlertTriangle} label={t("adminSettings.dataQuality.severity.critical")} value={criticalCount} tone="red" />
        <StatCard icon={CircleAlert} label={t("adminSettings.dataQuality.severity.warning")} value={warningCount} tone="amber" />
        <StatCard icon={Info} label={t("adminSettings.dataQuality.severity.info")} value={infoCount} tone="blue" />
      </div>

      {activeIssues.length > 0 && (
        <PriorityFixPlan
          issues={activeIssues.slice(0, 3)}
          title={t("adminSettings.dataQuality.planTitle")}
          hint={t("adminSettings.dataQuality.planHint")}
          totalLabel={t("adminSettings.dataQuality.planTotal", { count: totalCount })}
        />
      )}

      <RelationshipIntegrityPanelLazy overview={relationshipIntegrity} />

      {activeIssues.length === 0 && relationshipIntegrity.summary.total === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-300" />
          <h2 className="mt-3 text-lg font-semibold text-emerald-950 dark:text-emerald-100">{t("adminSettings.dataQuality.allGoodTitle")}</h2>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200">
            {t("adminSettings.dataQuality.allGoodText")}
          </p>
        </div>
      ) : activeIssues.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {activeIssues.map((issue) => (
            <IssueCard
              key={issue.key}
              issue={issue}
              foundLabel={t("adminSettings.dataQuality.found")}
              shownLabel={t("adminSettings.dataQuality.shownOf", { shown: issue.items.length, count: issue.count })}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function PriorityFixPlan({
  issues,
  title,
  hint,
  totalLabel,
}: {
  issues: QualityIssue[]
  title: string
  hint: string
  totalLabel: string
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {hint}
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {totalLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {issues.map((issue, index) => {
          const meta = severityMeta[issue.severity]
          const Icon = meta.icon
          return (
            <Link
              key={issue.key}
              href={issue.href}
              className="group rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.iconBox}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  #{index + 1}
                </span>
              </div>
              <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900 group-hover:text-blue-700 dark:text-slate-100 dark:group-hover:text-blue-200">
                {issue.title}
              </h3>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{issue.description}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}>
                  {issue.severityLabel} · {issue.count}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-300">
                  {issue.actionLabel}
                  <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function IssueCard({ issue, foundLabel, shownLabel }: { issue: QualityIssue; foundLabel: string; shownLabel: string }) {
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
                {issue.severityLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{issue.description}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{issue.count}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">{foundLabel}</p>
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
            {shownLabel}
          </span>
        )}
      </div>
    </section>
  )
}
