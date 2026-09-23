import type { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import type { Messages } from "@/lib/i18n/messages"
import type { TextKey } from "@/lib/i18n/translate"
import { displayRoleLabel, isStaffLikeRole } from "@/lib/role-capabilities"
import { formatMoney } from "@/lib/utils"

export type RelationshipSeverity = "critical" | "warning" | "info"

/** Ключ строки в разделе словаря adminChecks.integrity. */
export type IntegrityTextKey = Extract<TextKey<Messages>, `adminChecks.integrity.${string}`>

/** Значение подстановки: данные или такая же подпись из словаря. */
export type IntegrityVar = string | number | IntegrityText

/**
 * Подпись элемента проверки. Модуль знает только данные и ключ — фразу
 * собирает место отрисовки, потому что язык страницы известен там, а не здесь.
 *
 * Правило сборки: list переводится и склеивается через listSeparator; если
 * задан key, склеенное подставляется в него как {fields}, иначе оно и есть
 * подпись. Значение-объект в vars переводится так же (там запасные
 * формулировки вида «арендатор» или «без даты»).
 */
export type IntegrityText = {
  /** Данные как есть: название арендатора, номер счётчика, путь страницы. */
  text?: string
  key?: IntegrityTextKey
  vars?: Record<string, IntegrityVar>
  list?: IntegrityText[]
  listSeparator?: string
}

export type RelationshipContour =
  | "subscription"
  | "access"
  | "tenant"
  | "legal"
  | "finance"
  | "utilities"
  | "documents"
  | "storage"
  | "observability"

export type RelationshipIntegrityItem = {
  id: string
  label: IntegrityText
  meta: IntegrityText
  href: string
}

export type RelationshipIntegrityIssue = {
  /** Стабильный код проблемы: React-ключ, ссылки и сравнение между запусками. */
  key: string
  /** Ключи словаря: adminChecks.integrity.issues.<проблема>.* */
  titleKey: IntegrityTextKey
  descriptionKey: IntegrityTextKey
  actionKey: IntegrityTextKey
  severity: RelationshipSeverity
  contour: RelationshipContour
  count: number
  href: string
  items: RelationshipIntegrityItem[]
}

// Подпись и описание контура берутся при отрисовке по key:
// adminChecks.integrity.contours.<контур>.label и .description.
export type RelationshipIntegrityContourSummary = {
  key: RelationshipContour
  count: number
  critical: number
  warning: number
  info: number
  issues: RelationshipIntegrityIssue[]
}

export type RelationshipIntegrityOverview = {
  issues: RelationshipIntegrityIssue[]
  contours: RelationshipIntegrityContourSummary[]
  summary: {
    total: number
    critical: number
    warning: number
    info: number
  }
}

type GetRelationshipIntegrityOptions = {
  orgId: string
  buildingId?: string | null
  visibleBuildingIds: string[]
  sampleLimit?: number
}

type TenantListRow = Prisma.TenantGetPayload<{ select: ReturnType<typeof tenantListSelect> }>
type SpaceListRow = Prisma.SpaceGetPayload<{ select: ReturnType<typeof spaceListSelect> }>
type ContractListRow = Prisma.ContractGetPayload<{ select: ReturnType<typeof contractListSelect> }>
type PaymentReportListRow = Prisma.PaymentReportGetPayload<{ select: ReturnType<typeof paymentReportListSelect> }>
type MeterListRow = Prisma.MeterGetPayload<{ select: ReturnType<typeof meterListSelect> }>
type SignatureRequestListRow = Prisma.DocumentSignatureRequestGetPayload<{ select: ReturnType<typeof signatureRequestListSelect> }>

const DEFAULT_SAMPLE_LIMIT = 8
const SCAN_LIMIT = 120
const DAY_MS = 24 * 60 * 60 * 1000

// Порядок контуров в сводке; подписи — в словаре adminChecks.integrity.contours.
const CONTOURS: readonly RelationshipContour[] = [
  "subscription",
  "access",
  "tenant",
  "legal",
  "finance",
  "utilities",
  "documents",
  "storage",
  "observability",
]

export async function getRelationshipIntegrityOverview({
  orgId,
  buildingId,
  visibleBuildingIds,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
}: GetRelationshipIntegrityOptions): Promise<RelationshipIntegrityOverview> {
  const scopedBuildingIds = buildingId ? [buildingId] : visibleBuildingIds
  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const stalePaymentReportDate = new Date(today.getTime() - 2 * DAY_MS)
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const buildingScope: Prisma.BuildingWhereInput = {
    organizationId: orgId,
    id: scopedBuildingIds.length > 0 ? { in: scopedBuildingIds } : "__none__",
  }
  const floorScope: Prisma.FloorWhereInput = {
    building: buildingScope,
  }
  const spaceScope: Prisma.SpaceWhereInput = {
    floor: floorScope,
  }
  const placedTenantScope: Prisma.TenantWhereInput = {
    user: { organizationId: orgId },
    OR: [
      { space: spaceScope },
      { tenantSpaces: { some: { space: spaceScope } } },
      { fullFloors: { some: { building: buildingScope } } },
      // Киоск/антенна без помещения — привязан к зданию напрямую.
      { building: buildingScope },
    ],
  }
  const orgTenantScope: Prisma.TenantWhereInput = {
    user: { organizationId: orgId },
  }

  const [
    organization,
    activeSubscription,
    latestSubscription,
    buildingCount,
    activeTenantCount,
    activeUserCount,
    leadCount,
    ownerUser,
    buildingsWithoutAdminCount,
    buildingsWithoutAdmin,
    staffUsers,
    tenantsWithoutPlacementCount,
    tenantsWithoutPlacement,
    tenantsWithMultiplePlacementCount,
    tenantsWithMultiplePlacement,
    tenantsWithDualRentCount,
    tenantsWithDualRent,
    tenantsMissingTaxIdCount,
    tenantsMissingTaxId,
    tenantsWithoutBankAccountsCount,
    tenantsWithoutBankAccounts,
    occupiedWithoutTenantLinksCount,
    occupiedWithoutTenantLinks,
    vacantWithTenantLinksCount,
    vacantWithTenantLinks,
    fullFloorConflictCandidates,
    addendaWithoutParentCount,
    addendaWithoutParent,
    signedRentAddendaNotAppliedCount,
    signedRentAddendaNotApplied,
    tenantsWithoutSignedContractCount,
    tenantsWithoutSignedContract,
    confirmedReportsWithoutPaymentCount,
    confirmedReportsWithoutPayment,
    stalePaymentReportsCount,
    stalePaymentReports,
    metersWithoutCurrentReadingCount,
    metersWithoutCurrentReading,
    metersOnVacantSpacesCount,
    metersOnVacantSpaces,
    meterTariffScanRows,
    activeTariffs,
    expiredSignatureRequestsCount,
    expiredSignatureRequests,
    signedRequestsWithoutSignatureCount,
    signedRequestsWithoutSignature,
    orphanTenantFilesCount,
    orphanTenantFiles,
    oldTenantDocumentsCount,
    oldTenantDocuments,
    serverErrorsCount,
    serverErrors,
    poorWebVitalCount,
    poorWebVitals,
  ] = await Promise.all([
    db.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        legalType: true,
        legalName: true,
        bin: true,
        iin: true,
        directorName: true,
        directorPosition: true,
        basis: true,
        legalAddress: true,
        bankName: true,
        iik: true,
        bik: true,
        phone: true,
        email: true,
        ownerUserId: true,
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
            features: true,
            maxBuildings: true,
            maxTenants: true,
            maxUsers: true,
            maxLeads: true,
            isActive: true,
          },
        },
      },
    }),
    db.subscription.findFirst({
      where: { organizationId: orgId, status: "ACTIVE", expiresAt: { gte: now } },
      select: { id: true, status: true, expiresAt: true, plan: { select: { name: true } } },
      orderBy: { expiresAt: "desc" },
    }),
    db.subscription.findFirst({
      where: { organizationId: orgId },
      select: { id: true, status: true, expiresAt: true, plan: { select: { name: true } } },
      orderBy: { expiresAt: "desc" },
    }),
    db.building.count({ where: buildingScope }),
    db.tenant.count({ where: placedTenantScope }),
    db.user.count({ where: { organizationId: orgId, isActive: true } }),
    db.lead.count({ where: { building: buildingScope } }),
    db.user.findFirst({
      where: { organizationId: orgId, role: "OWNER", isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
    db.building.count({ where: { ...buildingScope, administratorUserId: null, isActive: true } }),
    db.building.findMany({
      where: { ...buildingScope, administratorUserId: null, isActive: true },
      select: { id: true, name: true, address: true },
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        buildingAccess: { select: { buildingId: true } },
        administeredBuildings: { select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.tenant.count({
      where: {
        ...orgTenantScope,
        spaceId: null,
        tenantSpaces: { none: {} },
        fullFloors: { none: {} },
      },
    }),
    db.tenant.findMany({
      where: {
        ...orgTenantScope,
        spaceId: null,
        tenantSpaces: { none: {} },
        fullFloors: { none: {} },
      },
      select: tenantListSelect(),
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.tenant.count({
      where: {
        AND: [
          placedTenantScope,
          {
            OR: [
              { spaceId: { not: null }, tenantSpaces: { some: {} } },
              { spaceId: { not: null }, fullFloors: { some: {} } },
              { tenantSpaces: { some: {} }, fullFloors: { some: {} } },
            ],
          },
        ],
      },
    }),
    db.tenant.findMany({
      where: {
        AND: [
          placedTenantScope,
          {
            OR: [
              { spaceId: { not: null }, tenantSpaces: { some: {} } },
              { spaceId: { not: null }, fullFloors: { some: {} } },
              { tenantSpaces: { some: {} }, fullFloors: { some: {} } },
            ],
          },
        ],
      },
      select: tenantListSelect(),
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.tenant.count({ where: { ...placedTenantScope, customRate: { gt: 0 }, fixedMonthlyRent: { gt: 0 } } }),
    db.tenant.findMany({
      where: { ...placedTenantScope, customRate: { gt: 0 }, fixedMonthlyRent: { gt: 0 } },
      select: {
        ...tenantListSelect(),
        customRate: true,
        fixedMonthlyRent: true,
      },
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.tenant.count({ where: { AND: [placedTenantScope, { OR: missingTaxIdWhere() }] } }),
    db.tenant.findMany({
      where: { AND: [placedTenantScope, { OR: missingTaxIdWhere() }] },
      select: { ...tenantListSelect(), legalType: true, bin: true, iin: true },
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.tenant.count({ where: { ...placedTenantScope, bankAccounts: { none: {} } } }),
    db.tenant.findMany({
      where: { ...placedTenantScope, bankAccounts: { none: {} } },
      select: tenantListSelect(),
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.space.count({
      where: {
        ...spaceScope,
        kind: "RENTABLE",
        status: "OCCUPIED",
        tenant: { is: null },
        tenantSpaces: { none: {} },
        floor: { ...floorScope, fullFloorTenantId: null },
      },
    }),
    db.space.findMany({
      where: {
        ...spaceScope,
        kind: "RENTABLE",
        status: "OCCUPIED",
        tenant: { is: null },
        tenantSpaces: { none: {} },
        floor: { ...floorScope, fullFloorTenantId: null },
      },
      select: spaceListSelect(),
      take: sampleLimit,
      orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
    }),
    db.space.count({
      where: {
        ...spaceScope,
        kind: "RENTABLE",
        status: "VACANT",
        OR: [{ tenant: { isNot: null } }, { tenantSpaces: { some: {} } }],
      },
    }),
    db.space.findMany({
      where: {
        ...spaceScope,
        kind: "RENTABLE",
        status: "VACANT",
        OR: [{ tenant: { isNot: null } }, { tenantSpaces: { some: {} } }],
      },
      select: {
        ...spaceListSelect(),
        tenant: { select: { id: true, companyName: true } },
        tenantSpaces: { select: { tenant: { select: { id: true, companyName: true } } }, take: 2 },
      },
      take: sampleLimit,
      orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
    }),
    db.floor.findMany({
      where: {
        ...floorScope,
        fullFloorTenantId: { not: null },
        spaces: {
          some: {
            OR: [{ tenant: { isNot: null } }, { tenantSpaces: { some: {} } }],
          },
        },
      },
      select: {
        id: true,
        name: true,
        fullFloorTenantId: true,
        building: { select: { name: true } },
        fullFloorTenant: { select: { id: true, companyName: true } },
        spaces: {
          where: { OR: [{ tenant: { isNot: null } }, { tenantSpaces: { some: {} } }] },
          select: {
            id: true,
            number: true,
            tenant: { select: { id: true, companyName: true } },
            tenantSpaces: { select: { tenant: { select: { id: true, companyName: true } } }, take: 2 },
          },
          take: 3,
        },
      },
      take: SCAN_LIMIT,
      orderBy: [{ building: { createdAt: "asc" } }, { number: "asc" }],
    }),
    db.contract.count({ where: { tenant: placedTenantScope, changeKind: { not: null }, parentContractId: null } }),
    db.contract.findMany({
      where: { tenant: placedTenantScope, changeKind: { not: null }, parentContractId: null },
      select: contractListSelect(),
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.contract.count({ where: { tenant: placedTenantScope, status: "SIGNED", changeKind: "RENTAL_TERMS", appliedAt: null } }),
    db.contract.findMany({
      where: { tenant: placedTenantScope, status: "SIGNED", changeKind: "RENTAL_TERMS", appliedAt: null },
      select: contractListSelect(),
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.tenant.count({
      where: {
        ...placedTenantScope,
        contracts: { none: { status: "SIGNED" } },
      },
    }),
    db.tenant.findMany({
      where: {
        ...placedTenantScope,
        contracts: { none: { status: "SIGNED" } },
      },
      select: tenantListSelect(),
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.paymentReport.count({ where: { tenant: placedTenantScope, status: "CONFIRMED", paymentId: null } }),
    db.paymentReport.findMany({
      where: { tenant: placedTenantScope, status: "CONFIRMED", paymentId: null },
      select: paymentReportListSelect(),
      take: sampleLimit,
      orderBy: { reviewedAt: "desc" },
    }),
    db.paymentReport.count({ where: { tenant: placedTenantScope, status: "PENDING", createdAt: { lt: stalePaymentReportDate } } }),
    db.paymentReport.findMany({
      where: { tenant: placedTenantScope, status: "PENDING", createdAt: { lt: stalePaymentReportDate } },
      select: paymentReportListSelect(),
      take: sampleLimit,
      orderBy: { createdAt: "asc" },
    }),
    db.meter.count({ where: { space: spaceScope, readings: { none: { period: currentPeriod } } } }),
    db.meter.findMany({
      where: { space: spaceScope, readings: { none: { period: currentPeriod } } },
      select: meterListSelect(),
      take: sampleLimit,
      orderBy: { number: "asc" },
    }),
    db.meter.count({ where: { space: { ...spaceScope, status: "VACANT" } } }),
    db.meter.findMany({
      where: { space: { ...spaceScope, status: "VACANT" } },
      select: meterListSelect(),
      take: sampleLimit,
      orderBy: { number: "asc" },
    }),
    db.meter.findMany({
      where: { space: spaceScope },
      select: meterListSelect(),
      take: SCAN_LIMIT,
      orderBy: { number: "asc" },
    }),
    db.tariff.findMany({
      where: { building: buildingScope, isActive: true },
      select: { buildingId: true, type: true },
    }),
    db.documentSignatureRequest.count({ where: { organizationId: orgId, status: "PENDING", expiresAt: { lt: now } } }),
    db.documentSignatureRequest.findMany({
      where: { organizationId: orgId, status: "PENDING", expiresAt: { lt: now } },
      select: signatureRequestListSelect(),
      take: sampleLimit,
      orderBy: { expiresAt: "asc" },
    }),
    db.documentSignatureRequest.count({ where: { organizationId: orgId, status: "SIGNED", signatureId: null } }),
    db.documentSignatureRequest.findMany({
      where: { organizationId: orgId, status: "SIGNED", signatureId: null },
      select: signatureRequestListSelect(),
      take: sampleLimit,
      orderBy: { signedAt: "desc" },
    }),
    db.storedFile.count({ where: { organizationId: orgId, deletedAt: null, ownerType: "TENANT", tenantId: null } }),
    db.storedFile.findMany({
      where: { organizationId: orgId, deletedAt: null, ownerType: "TENANT", tenantId: null },
      select: { id: true, fileName: true, category: true, createdAt: true },
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.tenantDocument.count({ where: { tenant: placedTenantScope, storageFileId: null, fileUrl: { not: null } } }),
    db.tenantDocument.findMany({
      where: { tenant: placedTenantScope, storageFileId: null, fileUrl: { not: null } },
      select: { id: true, name: true, type: true, tenant: { select: { id: true, companyName: true } } },
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.serverPerformanceLog.count({
      where: { organizationId: orgId, status: "error", createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
    }),
    db.serverPerformanceLog.findMany({
      where: { organizationId: orgId, status: "error", createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
      select: { id: true, route: true, step: true, error: true, createdAt: true },
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
    db.webVitalMetric.count({
      where: { organizationId: orgId, rating: "poor", createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
    }),
    db.webVitalMetric.findMany({
      where: { organizationId: orgId, rating: "poor", createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      select: { id: true, name: true, value: true, path: true, createdAt: true },
      take: sampleLimit,
      orderBy: { createdAt: "desc" },
    }),
  ])

  const issues: RelationshipIntegrityIssue[] = []
  const plan = organization?.plan ?? null
  const parsedPlanFeatures = parseJson(plan?.features)
  const missingOrgRequisites = missingOrganizationRequisites(organization)
  const staffWithoutScope = staffUsers.filter((user) => (
    isStaffLikeRole(user.role)
    && user.buildingAccess.length === 0
    && user.administeredBuildings.length === 0
  ))
  const tariffKeys = new Set(activeTariffs.map((tariff) => `${tariff.buildingId}:${tariff.type}`))
  const meterRowsWithoutTariff = meterTariffScanRows
    .filter((meter) => !tariffKeys.has(`${meter.space.floor.building.id}:${meter.type}`))
    .slice(0, sampleLimit)
  const fullFloorConflictItems = fullFloorConflictCandidates
    .filter((floor) => floor.spaces.some((space) => linkedTenantLabel(space)))
    .slice(0, sampleLimit)

  addIssue(issues, {
    key: "subscription-missing-active",
    titleKey: "adminChecks.integrity.issues.subscriptionMissingActive.title",
    descriptionKey: "adminChecks.integrity.issues.subscriptionMissingActive.description",
    actionKey: "adminChecks.integrity.issues.subscriptionMissingActive.action",
    severity: "critical",
    contour: "subscription",
    count: activeSubscription ? 0 : 1,
    href: "/admin/subscription",
    items: activeSubscription ? [] : [{
      id: "subscription",
      label: orgLabel(organization?.name),
      meta: latestSubscription
        ? {
            key: "adminChecks.integrity.issues.subscriptionMissingActive.metaLast",
            vars: { status: latestSubscription.status, date: numericDate(latestSubscription.expiresAt) },
          }
        : { key: "adminChecks.integrity.issues.subscriptionMissingActive.metaNone" },
      href: "/admin/subscription",
    }],
  })

  addIssue(issues, {
    key: "plan-missing-or-invalid",
    titleKey: "adminChecks.integrity.issues.planMissingOrInvalid.title",
    descriptionKey: "adminChecks.integrity.issues.planMissingOrInvalid.description",
    actionKey: "adminChecks.integrity.issues.planMissingOrInvalid.action",
    severity: "critical",
    contour: "subscription",
    count: !plan || parsedPlanFeatures.invalid ? 1 : 0,
    href: "/superadmin/plans",
    items: !plan || parsedPlanFeatures.invalid ? [{
      id: plan?.id ?? "plan",
      label: plan?.name
        ? { text: plan.name }
        : { key: "adminChecks.integrity.issues.planMissingOrInvalid.labelNone" },
      meta: {
        key: parsedPlanFeatures.invalid
          ? "adminChecks.integrity.issues.planMissingOrInvalid.metaInvalid"
          : "adminChecks.integrity.issues.planMissingOrInvalid.metaNone",
      },
      href: "/superadmin/plans",
    }] : [],
  })

  addLimitIssue(issues, plan?.maxBuildings, buildingCount, "subscription-buildings-limit", "buildings", "/admin/buildings")
  addLimitIssue(issues, plan?.maxTenants, activeTenantCount, "subscription-tenants-limit", "tenants", "/admin/tenants")
  addLimitIssue(issues, plan?.maxUsers, activeUserCount, "subscription-users-limit", "users", "/admin/users")
  addLimitIssue(issues, plan?.maxLeads, leadCount, "subscription-leads-limit", "leads", "/admin/subscription")

  addIssue(issues, {
    key: "owner-missing",
    titleKey: "adminChecks.integrity.issues.ownerMissing.title",
    descriptionKey: "adminChecks.integrity.issues.ownerMissing.description",
    actionKey: "adminChecks.integrity.issues.ownerMissing.action",
    severity: "critical",
    contour: "access",
    count: organization?.ownerUserId && ownerUser ? 0 : 1,
    href: "/admin/users",
    items: organization?.ownerUserId && ownerUser ? [] : [{
      id: "owner",
      label: orgLabel(organization?.name),
      meta: {
        key: organization?.ownerUserId
          ? "adminChecks.integrity.issues.ownerMissing.metaBroken"
          : "adminChecks.integrity.issues.ownerMissing.metaNone",
      },
      href: "/admin/users",
    }],
  })

  addIssue(issues, {
    key: "building-without-admin",
    titleKey: "adminChecks.integrity.issues.buildingWithoutAdmin.title",
    descriptionKey: "adminChecks.integrity.issues.buildingWithoutAdmin.description",
    actionKey: "adminChecks.integrity.issues.buildingWithoutAdmin.action",
    severity: "warning",
    contour: "access",
    count: buildingsWithoutAdminCount,
    href: "/admin/buildings",
    items: buildingsWithoutAdmin.map((building) => ({
      id: building.id,
      label: { text: building.name },
      meta: { text: building.address },
      href: "/admin/buildings",
    })),
  })

  addIssue(issues, {
    key: "staff-without-building-scope",
    titleKey: "adminChecks.integrity.issues.staffWithoutBuildingScope.title",
    descriptionKey: "adminChecks.integrity.issues.staffWithoutBuildingScope.description",
    actionKey: "adminChecks.integrity.issues.staffWithoutBuildingScope.action",
    severity: "warning",
    contour: "access",
    count: staffWithoutScope.length,
    href: "/admin/users",
    items: staffWithoutScope.slice(0, sampleLimit).map((user) => ({
      id: user.id,
      label: { text: user.name },
      meta: {
        key: "adminChecks.integrity.issues.staffWithoutBuildingScope.meta",
        vars: { role: displayRoleLabel(user.role) },
      },
      href: "/admin/users",
    })),
  })

  addIssue(issues, {
    key: "tenant-without-placement",
    titleKey: "adminChecks.integrity.issues.tenantWithoutPlacement.title",
    descriptionKey: "adminChecks.integrity.issues.tenantWithoutPlacement.description",
    actionKey: "adminChecks.integrity.issues.tenantWithoutPlacement.action",
    severity: "critical",
    contour: "tenant",
    count: tenantsWithoutPlacementCount,
    href: "/admin/tenants",
    items: tenantsWithoutPlacement.map((tenant) => tenantItem(tenant, {
      key: "adminChecks.integrity.issues.tenantWithoutPlacement.meta",
    })),
  })

  addIssue(issues, {
    key: "tenant-multiple-placement-conflict",
    titleKey: "adminChecks.integrity.issues.tenantMultiplePlacementConflict.title",
    descriptionKey: "adminChecks.integrity.issues.tenantMultiplePlacementConflict.description",
    actionKey: "adminChecks.integrity.issues.tenantMultiplePlacementConflict.action",
    severity: "warning",
    contour: "tenant",
    count: tenantsWithMultiplePlacementCount,
    href: "/admin/tenants",
    items: tenantsWithMultiplePlacement.map((tenant) => tenantItem(tenant, tenantPlacementText(tenant))),
  })

  addIssue(issues, {
    key: "tenant-dual-rent-method",
    titleKey: "adminChecks.integrity.issues.tenantDualRentMethod.title",
    descriptionKey: "adminChecks.integrity.issues.tenantDualRentMethod.description",
    actionKey: "adminChecks.integrity.issues.tenantDualRentMethod.action",
    severity: "critical",
    contour: "tenant",
    count: tenantsWithDualRentCount,
    href: "/admin/tenants",
    items: tenantsWithDualRent.map((tenant) => tenantItem(tenant, {
      key: "adminChecks.integrity.issues.tenantDualRentMethod.meta",
      vars: { rate: formatMoney(tenant.customRate ?? 0), fixed: formatMoney(tenant.fixedMonthlyRent ?? 0) },
    })),
  })

  addIssue(issues, {
    key: "tenant-missing-tax-id",
    titleKey: "adminChecks.integrity.issues.tenantMissingTaxId.title",
    descriptionKey: "adminChecks.integrity.issues.tenantMissingTaxId.description",
    actionKey: "adminChecks.integrity.issues.tenantMissingTaxId.action",
    severity: "critical",
    contour: "legal",
    count: tenantsMissingTaxIdCount,
    href: "/admin/tenants",
    items: tenantsMissingTaxId.map((tenant) => tenantItem(tenant, {
      key: "adminChecks.integrity.issues.tenantMissingTaxId.meta",
      vars: { legalType: tenant.legalType, bin: tenant.bin || "-", iin: tenant.iin || "-" },
    })),
  })

  addIssue(issues, {
    key: "tenant-missing-bank-accounts",
    titleKey: "adminChecks.integrity.issues.tenantMissingBankAccounts.title",
    descriptionKey: "adminChecks.integrity.issues.tenantMissingBankAccounts.description",
    actionKey: "adminChecks.integrity.issues.tenantMissingBankAccounts.action",
    severity: "info",
    contour: "finance",
    count: tenantsWithoutBankAccountsCount,
    href: "/admin/tenants",
    items: tenantsWithoutBankAccounts.map((tenant) => tenantItem(tenant, {
      key: "adminChecks.integrity.issues.tenantMissingBankAccounts.meta",
    })),
  })

  addIssue(issues, {
    key: "occupied-without-tenant-link",
    titleKey: "adminChecks.integrity.issues.occupiedWithoutTenantLink.title",
    descriptionKey: "adminChecks.integrity.issues.occupiedWithoutTenantLink.description",
    actionKey: "adminChecks.integrity.issues.occupiedWithoutTenantLink.action",
    severity: "critical",
    contour: "tenant",
    count: occupiedWithoutTenantLinksCount,
    href: "/admin/spaces",
    items: occupiedWithoutTenantLinks.map((space) => spaceItem(space, {
      key: "adminChecks.integrity.issues.occupiedWithoutTenantLink.meta",
    })),
  })

  addIssue(issues, {
    key: "vacant-with-tenant-link",
    titleKey: "adminChecks.integrity.issues.vacantWithTenantLink.title",
    descriptionKey: "adminChecks.integrity.issues.vacantWithTenantLink.description",
    actionKey: "adminChecks.integrity.issues.vacantWithTenantLink.action",
    severity: "critical",
    contour: "tenant",
    count: vacantWithTenantLinksCount,
    href: "/admin/spaces",
    items: vacantWithTenantLinks.map((space) => {
      const linked = space.tenant ?? space.tenantSpaces[0]?.tenant ?? null
      return spaceItem(
        space,
        {
          key: "adminChecks.integrity.issues.vacantWithTenantLink.meta",
          vars: { tenant: linked?.companyName ?? { key: "adminChecks.integrity.common.tenantFallback" } },
        },
        linked?.id,
      )
    }),
  })

  addIssue(issues, {
    key: "full-floor-individual-space-conflict",
    titleKey: "adminChecks.integrity.issues.fullFloorIndividualSpaceConflict.title",
    descriptionKey: "adminChecks.integrity.issues.fullFloorIndividualSpaceConflict.description",
    actionKey: "adminChecks.integrity.issues.fullFloorIndividualSpaceConflict.action",
    severity: "warning",
    contour: "tenant",
    count: fullFloorConflictCandidates.length,
    href: "/admin/buildings",
    items: fullFloorConflictItems.map((floor) => ({
      id: floor.id,
      label: {
        key: "adminChecks.integrity.issues.fullFloorIndividualSpaceConflict.label" as const,
        vars: { building: floor.building.name, floor: floor.name },
      },
      meta: {
        key: "adminChecks.integrity.issues.fullFloorIndividualSpaceConflict.meta" as const,
        vars: {
          tenant: floor.fullFloorTenant?.companyName ?? { key: "adminChecks.integrity.common.tenantFallback" as const },
          count: floor.spaces.length,
        },
      },
      href: floor.fullFloorTenant ? `/admin/tenants/${floor.fullFloorTenant.id}` : "/admin/buildings",
    })),
  })

  addIssue(issues, {
    key: "addendum-without-parent",
    titleKey: "adminChecks.integrity.issues.addendumWithoutParent.title",
    descriptionKey: "adminChecks.integrity.issues.addendumWithoutParent.description",
    actionKey: "adminChecks.integrity.issues.addendumWithoutParent.action",
    severity: "critical",
    contour: "legal",
    count: addendaWithoutParentCount,
    href: "/admin/documents",
    items: addendaWithoutParent.map((contract) => contractItem(contract, {
      key: "adminChecks.integrity.issues.addendumWithoutParent.meta",
    })),
  })

  addIssue(issues, {
    key: "signed-rent-addendum-not-applied",
    titleKey: "adminChecks.integrity.issues.signedRentAddendumNotApplied.title",
    descriptionKey: "adminChecks.integrity.issues.signedRentAddendumNotApplied.description",
    actionKey: "adminChecks.integrity.issues.signedRentAddendumNotApplied.action",
    severity: "critical",
    contour: "legal",
    count: signedRentAddendaNotAppliedCount,
    href: "/admin/documents",
    items: signedRentAddendaNotApplied.map((contract) => contractItem(contract, {
      key: "adminChecks.integrity.issues.signedRentAddendumNotApplied.meta",
    })),
  })

  addIssue(issues, {
    key: "tenant-without-signed-contract",
    titleKey: "adminChecks.integrity.issues.tenantWithoutSignedContract.title",
    descriptionKey: "adminChecks.integrity.issues.tenantWithoutSignedContract.description",
    actionKey: "adminChecks.integrity.issues.tenantWithoutSignedContract.action",
    severity: "warning",
    contour: "legal",
    count: tenantsWithoutSignedContractCount,
    href: "/admin/tenants",
    items: tenantsWithoutSignedContract.map((tenant) => tenantItem(tenant, tenantPlacementText(tenant))),
  })

  addIssue(issues, {
    key: "confirmed-payment-report-without-payment",
    titleKey: "adminChecks.integrity.issues.confirmedPaymentReportWithoutPayment.title",
    descriptionKey: "adminChecks.integrity.issues.confirmedPaymentReportWithoutPayment.description",
    actionKey: "adminChecks.integrity.issues.confirmedPaymentReportWithoutPayment.action",
    severity: "critical",
    contour: "finance",
    count: confirmedReportsWithoutPaymentCount,
    href: "/admin/finances",
    items: confirmedReportsWithoutPayment.map((report) => paymentReportItem(report, {
      key: "adminChecks.integrity.issues.confirmedPaymentReportWithoutPayment.meta",
    })),
  })

  addIssue(issues, {
    key: "stale-payment-report",
    titleKey: "adminChecks.integrity.issues.stalePaymentReport.title",
    descriptionKey: "adminChecks.integrity.issues.stalePaymentReport.description",
    actionKey: "adminChecks.integrity.issues.stalePaymentReport.action",
    severity: "warning",
    contour: "finance",
    count: stalePaymentReportsCount,
    href: "/admin/finances",
    items: stalePaymentReports.map((report) => paymentReportItem(report, {
      key: "adminChecks.integrity.issues.stalePaymentReport.meta",
      vars: { date: numericDate(report.createdAt) },
    })),
  })

  addIssue(issues, {
    key: "meter-without-current-reading",
    titleKey: "adminChecks.integrity.issues.meterWithoutCurrentReading.title",
    descriptionKey: "adminChecks.integrity.issues.meterWithoutCurrentReading.description",
    actionKey: "adminChecks.integrity.issues.meterWithoutCurrentReading.action",
    severity: "warning",
    contour: "utilities",
    count: metersWithoutCurrentReadingCount,
    href: "/admin/meters",
    items: metersWithoutCurrentReading.map((meter) => meterItem(meter, {
      key: "adminChecks.integrity.issues.meterWithoutCurrentReading.meta",
      vars: { period: currentPeriod },
    })),
  })

  addIssue(issues, {
    key: "meter-on-vacant-space",
    titleKey: "adminChecks.integrity.issues.meterOnVacantSpace.title",
    descriptionKey: "adminChecks.integrity.issues.meterOnVacantSpace.description",
    actionKey: "adminChecks.integrity.issues.meterOnVacantSpace.action",
    severity: "info",
    contour: "utilities",
    count: metersOnVacantSpacesCount,
    href: "/admin/meters",
    items: metersOnVacantSpaces.map((meter) => meterItem(meter, {
      key: "adminChecks.integrity.issues.meterOnVacantSpace.meta",
    })),
  })

  addIssue(issues, {
    key: "meter-without-tariff",
    titleKey: "adminChecks.integrity.issues.meterWithoutTariff.title",
    descriptionKey: "adminChecks.integrity.issues.meterWithoutTariff.description",
    actionKey: "adminChecks.integrity.issues.meterWithoutTariff.action",
    severity: "warning",
    contour: "utilities",
    count: meterRowsWithoutTariff.length,
    href: "/admin/meters",
    items: meterRowsWithoutTariff.map((meter) => meterItem(meter, {
      key: "adminChecks.integrity.issues.meterWithoutTariff.meta",
      vars: { type: meter.type },
    })),
  })

  addIssue(issues, {
    key: "expired-signature-request",
    titleKey: "adminChecks.integrity.issues.expiredSignatureRequest.title",
    descriptionKey: "adminChecks.integrity.issues.expiredSignatureRequest.description",
    actionKey: "adminChecks.integrity.issues.expiredSignatureRequest.action",
    severity: "warning",
    contour: "documents",
    count: expiredSignatureRequestsCount,
    href: "/admin/documents",
    items: expiredSignatureRequests.map((request) => signatureRequestItem(
      request,
      request.expiresAt
        ? {
            key: "adminChecks.integrity.issues.expiredSignatureRequest.meta",
            vars: { date: numericDate(request.expiresAt) },
          }
        : { key: "adminChecks.integrity.issues.expiredSignatureRequest.metaNoDate" },
    )),
  })

  addIssue(issues, {
    key: "signed-request-without-signature",
    titleKey: "adminChecks.integrity.issues.signedRequestWithoutSignature.title",
    descriptionKey: "adminChecks.integrity.issues.signedRequestWithoutSignature.description",
    actionKey: "adminChecks.integrity.issues.signedRequestWithoutSignature.action",
    severity: "critical",
    contour: "documents",
    count: signedRequestsWithoutSignatureCount,
    href: "/admin/documents",
    items: signedRequestsWithoutSignature.map((request) => signatureRequestItem(request, {
      key: "adminChecks.integrity.issues.signedRequestWithoutSignature.meta",
    })),
  })

  addIssue(issues, {
    key: "tenant-storage-file-without-tenant",
    titleKey: "adminChecks.integrity.issues.tenantStorageFileWithoutTenant.title",
    descriptionKey: "adminChecks.integrity.issues.tenantStorageFileWithoutTenant.description",
    actionKey: "adminChecks.integrity.issues.tenantStorageFileWithoutTenant.action",
    severity: "warning",
    contour: "storage",
    count: orphanTenantFilesCount,
    href: "/admin/storage",
    items: orphanTenantFiles.map((file) => ({
      id: file.id,
      label: { text: file.fileName },
      meta: {
        key: "adminChecks.integrity.issues.tenantStorageFileWithoutTenant.meta" as const,
        vars: { category: file.category, date: numericDate(file.createdAt) },
      },
      href: "/admin/storage",
    })),
  })

  addIssue(issues, {
    key: "tenant-document-outside-storage",
    titleKey: "adminChecks.integrity.issues.tenantDocumentOutsideStorage.title",
    descriptionKey: "adminChecks.integrity.issues.tenantDocumentOutsideStorage.description",
    actionKey: "adminChecks.integrity.issues.tenantDocumentOutsideStorage.action",
    severity: "info",
    contour: "storage",
    count: oldTenantDocumentsCount,
    href: "/admin/storage",
    items: oldTenantDocuments.map((document) => ({
      id: document.id,
      label: { text: document.name },
      meta: {
        key: "adminChecks.integrity.issues.tenantDocumentOutsideStorage.meta" as const,
        vars: { tenant: document.tenant.companyName, type: document.type },
      },
      href: `/admin/tenants/${document.tenant.id}`,
    })),
  })

  addIssue(issues, {
    key: "org-requisites-missing",
    titleKey: "adminChecks.integrity.issues.orgRequisitesMissing.title",
    descriptionKey: "adminChecks.integrity.issues.orgRequisitesMissing.description",
    actionKey: "adminChecks.integrity.issues.orgRequisitesMissing.action",
    severity: "critical",
    contour: "legal",
    count: missingOrgRequisites.length > 0 ? 1 : 0,
    href: "/admin/settings",
    items: missingOrgRequisites.length > 0 ? [{
      id: "org-requisites",
      label: orgLabel(organization?.name),
      meta: {
        key: "adminChecks.integrity.issues.orgRequisitesMissing.meta",
        list: missingOrgRequisites.map((field) => ({ key: field })),
        listSeparator: ", ",
      },
      href: "/admin/settings",
    }] : [],
  })

  addIssue(issues, {
    key: "server-errors-24h",
    titleKey: "adminChecks.integrity.issues.serverErrors24h.title",
    descriptionKey: "adminChecks.integrity.issues.serverErrors24h.description",
    actionKey: "adminChecks.integrity.issues.serverErrors24h.action",
    severity: "critical",
    contour: "observability",
    count: serverErrorsCount,
    href: "/admin/system-health",
    items: serverErrors.map((row) => ({
      id: row.id,
      label: { text: row.route },
      meta: {
        key: "adminChecks.integrity.issues.serverErrors24h.meta" as const,
        vars: {
          step: row.step ?? { key: "adminChecks.integrity.issues.serverErrors24h.stepFallback" as const },
          date: numericDate(row.createdAt),
          error: row.error ?? { key: "adminChecks.integrity.issues.serverErrors24h.errorFallback" as const },
        },
      },
      href: "/admin/system-health",
    })),
  })

  addIssue(issues, {
    key: "poor-web-vitals",
    titleKey: "adminChecks.integrity.issues.poorWebVitals.title",
    descriptionKey: "adminChecks.integrity.issues.poorWebVitals.description",
    actionKey: "adminChecks.integrity.issues.poorWebVitals.action",
    severity: "warning",
    contour: "observability",
    count: poorWebVitalCount,
    href: "/superadmin/performance",
    items: poorWebVitals.map((metric) => ({
      id: metric.id,
      label: { text: `${metric.name}: ${Math.round(metric.value)}` },
      meta: {
        key: "adminChecks.integrity.issues.poorWebVitals.meta" as const,
        vars: {
          path: metric.path ?? { key: "adminChecks.integrity.issues.poorWebVitals.pathFallback" as const },
          date: numericDate(metric.createdAt),
        },
      },
      href: "/superadmin/performance",
    })),
  })

  const activeIssues = issues
    .filter((issue) => issue.count > 0)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.count - a.count)
  const summary = {
    total: activeIssues.reduce((sum, issue) => sum + issue.count, 0),
    critical: activeIssues.filter((issue) => issue.severity === "critical").reduce((sum, issue) => sum + issue.count, 0),
    warning: activeIssues.filter((issue) => issue.severity === "warning").reduce((sum, issue) => sum + issue.count, 0),
    info: activeIssues.filter((issue) => issue.severity === "info").reduce((sum, issue) => sum + issue.count, 0),
  }

  return {
    issues: activeIssues,
    contours: buildContourSummaries(activeIssues),
    summary,
  }
}

function tenantListSelect() {
  return {
    id: true,
    companyName: true,
    legalType: true,
    space: { select: { number: true, floor: { select: { name: true, building: { select: { name: true } } } } } },
    tenantSpaces: {
      select: { space: { select: { number: true, floor: { select: { name: true, building: { select: { name: true } } } } } } },
      take: 3,
    },
    fullFloors: { select: { name: true, building: { select: { name: true } } }, take: 3 },
  } satisfies Prisma.TenantSelect
}

function spaceListSelect() {
  return {
    id: true,
    number: true,
    area: true,
    status: true,
    floor: { select: { name: true, building: { select: { name: true } } } },
  } satisfies Prisma.SpaceSelect
}

function contractListSelect() {
  return {
    id: true,
    number: true,
    status: true,
    changeKind: true,
    createdAt: true,
    tenant: { select: { id: true, companyName: true } },
  } satisfies Prisma.ContractSelect
}

function paymentReportListSelect() {
  return {
    id: true,
    amount: true,
    status: true,
    createdAt: true,
    reviewedAt: true,
    tenant: { select: { id: true, companyName: true } },
  } satisfies Prisma.PaymentReportSelect
}

function meterListSelect() {
  return {
    id: true,
    type: true,
    number: true,
    space: { select: { number: true, status: true, floor: { select: { name: true, building: { select: { id: true, name: true } } } } } },
  } satisfies Prisma.MeterSelect
}

function signatureRequestListSelect() {
  return {
    id: true,
    title: true,
    documentType: true,
    documentRef: true,
    status: true,
    expiresAt: true,
    signedAt: true,
  } satisfies Prisma.DocumentSignatureRequestSelect
}

function missingTaxIdWhere(): Prisma.TenantWhereInput[] {
  return [
    {
      legalType: { in: ["TOO", "TОО", "ТОО", "AO", "АО"] },
      OR: [{ bin: null }, { bin: "" }],
    },
    {
      legalType: { in: ["IP", "ИП", "CHSI", "ЧСИ", "INDIVIDUAL", "ФИЗЛИЦО", "PHYSICAL"] },
      OR: [{ iin: null }, { iin: "" }],
    },
  ]
}

function addIssue(issues: RelationshipIntegrityIssue[], issue: RelationshipIntegrityIssue) {
  if (issue.count > 0) issues.push(issue)
}

function addLimitIssue(
  issues: RelationshipIntegrityIssue[],
  limit: number | null | undefined,
  used: number,
  key: string,
  subject: "buildings" | "tenants" | "users" | "leads",
  href: string,
) {
  if (!limit || used <= limit) return
  // Заголовок у каждого лимита свой, а описание, действие и подпись — общие.
  const titleKeys = {
    buildings: "adminChecks.integrity.issues.limit.buildingsTitle",
    tenants: "adminChecks.integrity.issues.limit.tenantsTitle",
    users: "adminChecks.integrity.issues.limit.usersTitle",
    leads: "adminChecks.integrity.issues.limit.leadsTitle",
  } as const
  const labelKeys = {
    buildings: "adminChecks.integrity.issues.limit.buildingsLabel",
    tenants: "adminChecks.integrity.issues.limit.tenantsLabel",
    users: "adminChecks.integrity.issues.limit.usersLabel",
    leads: "adminChecks.integrity.issues.limit.leadsLabel",
  } as const

  addIssue(issues, {
    key,
    titleKey: titleKeys[subject],
    descriptionKey: "adminChecks.integrity.issues.limit.description",
    actionKey: "adminChecks.integrity.issues.limit.action",
    severity: "warning",
    contour: "subscription",
    count: used - limit,
    href,
    items: [{
      id: key,
      label: { key: labelKeys[subject] },
      meta: { key: "adminChecks.integrity.issues.limit.meta", vars: { used, limit } },
      href,
    }],
  })
}

/** Название организации, а если его нет — нейтральное слово из словаря. */
function orgLabel(name: string | null | undefined): IntegrityText {
  return name ? { text: name } : { key: "adminChecks.integrity.common.orgFallback" }
}

/**
 * Дата в диагностике — только цифрами: месяц прописью пришлось бы переводить,
 * а «22.09.2026» читается одинаково на обоих языках.
 */
function numericDate(value: Date | null | undefined): string {
  if (!value) return "-"
  const day = String(value.getDate()).padStart(2, "0")
  const month = String(value.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}.${value.getFullYear()}`
}

function tenantItem(tenant: TenantListRow, meta: IntegrityText): RelationshipIntegrityItem {
  return {
    id: tenant.id,
    label: { text: tenant.companyName },
    meta,
    href: `/admin/tenants/${tenant.id}`,
  }
}

function spaceItem(space: SpaceListRow, reason: IntegrityText, tenantId?: string): RelationshipIntegrityItem {
  return {
    id: space.id,
    label: {
      key: "adminChecks.integrity.common.spaceLabel",
      vars: { building: space.floor.building.name, floor: space.floor.name, number: space.number },
    },
    meta: {
      key: "adminChecks.integrity.common.spaceMeta",
      vars: { reason, area: space.area },
    },
    href: tenantId ? `/admin/tenants/${tenantId}` : "/admin/spaces",
  }
}

function contractItem(contract: ContractListRow, reason: IntegrityText): RelationshipIntegrityItem {
  return {
    id: contract.id,
    label: { key: "adminChecks.integrity.common.contractLabel", vars: { number: contract.number } },
    meta: {
      key: "adminChecks.integrity.common.contractMeta",
      vars: {
        tenant: contract.tenant.companyName,
        // changeKind — код изменения из базы, он и в диагностике остаётся кодом.
        kind: contract.changeKind ?? { key: "adminChecks.integrity.common.contractKindFallback" },
        reason,
      },
    },
    href: `/admin/tenants/${contract.tenant.id}`,
  }
}

function paymentReportItem(report: PaymentReportListRow, meta: IntegrityText): RelationshipIntegrityItem {
  return {
    id: report.id,
    label: { text: `${report.tenant.companyName} · ${formatMoney(report.amount)}` },
    meta,
    href: `/admin/tenants/${report.tenant.id}`,
  }
}

function meterItem(meter: MeterListRow, reason: IntegrityText): RelationshipIntegrityItem {
  return {
    id: meter.id,
    label: {
      key: "adminChecks.integrity.common.spaceLabel",
      vars: {
        building: meter.space.floor.building.name,
        floor: meter.space.floor.name,
        number: meter.space.number,
      },
    },
    meta: {
      key: "adminChecks.integrity.common.meterMeta",
      vars: {
        type: meter.type,
        number: meter.number,
        reason,
      },
    },
    href: "/admin/meters",
  }
}

function signatureRequestItem(request: SignatureRequestListRow, reason: IntegrityText): RelationshipIntegrityItem {
  return {
    id: request.id,
    label: { text: request.title },
    meta: {
      key: "adminChecks.integrity.common.signatureMeta",
      vars: {
        document: `${request.documentType} ${request.documentRef ?? ""}`.trim(),
        reason,
      },
    },
    href: "/admin/documents",
  }
}

function tenantPlacementText(tenant: TenantListRow): IntegrityText {
  const parts: IntegrityText[] = []
  if (tenant.space) {
    parts.push({ key: "adminChecks.integrity.common.placementSpace", vars: { number: tenant.space.number } })
  }
  if (tenant.tenantSpaces.length > 0) {
    parts.push({ key: "adminChecks.integrity.common.placementSpaces", vars: { count: tenant.tenantSpaces.length } })
  }
  if (tenant.fullFloors.length > 0) {
    parts.push({ key: "adminChecks.integrity.common.placementFloors", vars: { count: tenant.fullFloors.length } })
  }
  return parts.length > 0
    ? { list: parts }
    : { key: "adminChecks.integrity.common.placementNone" }
}

function linkedTenantLabel(space: {
  tenant?: { id: string; companyName: string } | null
  tenantSpaces?: Array<{ tenant: { id: string; companyName: string } }>
}) {
  return space.tenant?.companyName ?? space.tenantSpaces?.[0]?.tenant.companyName ?? null
}

function missingOrganizationRequisites(org: {
  legalType: string | null
  legalName: string | null
  bin: string | null
  iin: string | null
  directorName: string | null
  directorPosition: string | null
  basis: string | null
  legalAddress: string | null
  bankName: string | null
  iik: string | null
  bik: string | null
  phone: string | null
  email: string | null
} | null): IntegrityTextKey[] {
  const fields = "adminChecks.integrity.issues.orgRequisitesMissing.fields"
  if (!org) return [`${fields}.organization`]
  const missing: IntegrityTextKey[] = []
  if (!org.legalType) missing.push(`${fields}.legalType`)
  if (!org.legalName) missing.push(`${fields}.legalName`)
  if (["TOO", "ТОО", "AO", "АО"].includes(org.legalType ?? "") && !org.bin) missing.push(`${fields}.bin`)
  if (["IP", "ИП", "CHSI", "ЧСИ"].includes(org.legalType ?? "") && !org.iin) missing.push(`${fields}.iin`)
  if (!org.directorName) missing.push(`${fields}.directorName`)
  if (!org.directorPosition) missing.push(`${fields}.directorPosition`)
  if (!org.basis) missing.push(`${fields}.basis`)
  if (!org.legalAddress) missing.push(`${fields}.legalAddress`)
  if (!org.bankName) missing.push(`${fields}.bankName`)
  if (!org.iik) missing.push(`${fields}.iik`)
  if (!org.bik) missing.push(`${fields}.bik`)
  if (!org.phone) missing.push(`${fields}.phone`)
  if (!org.email) missing.push(`${fields}.email`)
  return missing
}

function parseJson(value: string | null | undefined) {
  if (!value) return { invalid: true }
  try {
    const parsed = JSON.parse(value)
    return { invalid: typeof parsed !== "object" || parsed === null }
  } catch {
    return { invalid: true }
  }
}

function buildContourSummaries(issues: RelationshipIntegrityIssue[]) {
  return CONTOURS
    .map((key) => {
      const contourIssues = issues.filter((issue) => issue.contour === key)
      return {
        key,
        count: contourIssues.reduce((sum, issue) => sum + issue.count, 0),
        critical: contourIssues.filter((issue) => issue.severity === "critical").reduce((sum, issue) => sum + issue.count, 0),
        warning: contourIssues.filter((issue) => issue.severity === "warning").reduce((sum, issue) => sum + issue.count, 0),
        info: contourIssues.filter((issue) => issue.severity === "info").reduce((sum, issue) => sum + issue.count, 0),
        issues: contourIssues,
      }
    })
    .filter((contour) => contour.count > 0)
    .sort((a, b) => b.critical - a.critical || b.warning - a.warning || b.count - a.count)
}

function severityRank(severity: RelationshipSeverity) {
  if (severity === "critical") return 0
  if (severity === "warning") return 1
  return 2
}
