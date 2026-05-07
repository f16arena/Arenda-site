import type { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { displayRoleLabel, isStaffLikeRole } from "@/lib/role-capabilities"
import { formatDate, formatMoney } from "@/lib/utils"

export type RelationshipSeverity = "critical" | "warning" | "info"

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
  label: string
  meta: string
  href: string
}

export type RelationshipIntegrityIssue = {
  key: string
  title: string
  description: string
  severity: RelationshipSeverity
  contour: RelationshipContour
  count: number
  actionLabel: string
  href: string
  items: RelationshipIntegrityItem[]
}

export type RelationshipIntegrityContourSummary = {
  key: RelationshipContour
  label: string
  description: string
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
const REQUIRED_TEMPLATE_TYPES = ["CONTRACT", "INVOICE", "ACT", "RECONCILIATION"] as const

const CONTOUR_META: Record<RelationshipContour, { label: string; description: string }> = {
  subscription: {
    label: "Тариф и лимиты",
    description: "План, подписка, лимиты зданий, арендаторов, пользователей и лидов.",
  },
  access: {
    label: "Владелец и доступы",
    description: "Владелец организации, администраторы зданий и привязка сотрудников к объектам.",
  },
  tenant: {
    label: "Арендаторы и площади",
    description: "Связи арендатор -> помещение, несколько помещений, этажи и статусы занятости.",
  },
  legal: {
    label: "Юридический контур",
    description: "Договоры, доп. соглашения, реквизиты и юридическое основание изменений.",
  },
  finance: {
    label: "Финансовый контур",
    description: "Начисления, оплаты, чеки, подтверждение платежей и закрытие долга.",
  },
  utilities: {
    label: "Коммунальные услуги",
    description: "Счетчики, показания и тарифы по свету, воде, отоплению и другим услугам.",
  },
  documents: {
    label: "Документы и подписи",
    description: "Шаблоны, сгенерированные документы, подписи и запросы на подпись.",
  },
  storage: {
    label: "Хранилище",
    description: "Файлы в БД, чеки, документы арендаторов и разделение по организации.",
  },
  observability: {
    label: "Ошибки и скорость",
    description: "Серверные ошибки, performance logs и реальные метрики сайта.",
  },
}

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
    activeTemplateRows,
    generatedWithoutTemplateCount,
    generatedWithoutTemplate,
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
    db.documentTemplate.findMany({
      where: { organizationId: orgId, isActive: true, documentType: { in: [...REQUIRED_TEMPLATE_TYPES] } },
      select: { documentType: true },
    }),
    db.generatedDocument.count({ where: { organizationId: orgId, templateUsedId: null } }),
    db.generatedDocument.findMany({
      where: { organizationId: orgId, templateUsedId: null },
      select: {
        id: true,
        documentType: true,
        number: true,
        tenantName: true,
        generatedAt: true,
      },
      take: sampleLimit,
      orderBy: { generatedAt: "desc" },
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
  const activeTemplateTypes = new Set(activeTemplateRows.map((template) => template.documentType))
  const missingTemplates = REQUIRED_TEMPLATE_TYPES.filter((type) => !activeTemplateTypes.has(type))
  const tariffKeys = new Set(activeTariffs.map((tariff) => `${tariff.buildingId}:${tariff.type}`))
  const meterRowsWithoutTariff = meterTariffScanRows
    .filter((meter) => !tariffKeys.has(`${meter.space.floor.building.id}:${meter.type}`))
    .slice(0, sampleLimit)
  const fullFloorConflictItems = fullFloorConflictCandidates
    .filter((floor) => floor.spaces.some((space) => linkedTenantLabel(space)))
    .slice(0, sampleLimit)

  addIssue(issues, {
    key: "subscription-missing-active",
    title: "Нет активной подписки",
    description: "Организация работает без активной подписки. В SaaS-контуре это должно быть явно: активный тариф, срок действия и статус оплаты.",
    severity: "critical",
    contour: "subscription",
    count: activeSubscription ? 0 : 1,
    actionLabel: "Открыть подписку",
    href: "/admin/settings",
    items: activeSubscription ? [] : [{
      id: "subscription",
      label: organization?.name ?? "Организация",
      meta: latestSubscription
        ? `Последняя подписка: ${latestSubscription.status}, до ${formatDate(latestSubscription.expiresAt)}`
        : "Подписка еще не заведена",
      href: "/admin/settings",
    }],
  })

  addIssue(issues, {
    key: "plan-missing-or-invalid",
    title: "Тариф не настроен или features повреждены",
    description: "Тариф должен быть читаемым JSON-набором возможностей и лимитов. Иначе superadmin не сможет надежно управлять доступными функциями.",
    severity: "critical",
    contour: "subscription",
    count: !plan || parsedPlanFeatures.invalid ? 1 : 0,
    actionLabel: "Открыть тариф",
    href: "/superadmin/plans",
    items: !plan || parsedPlanFeatures.invalid ? [{
      id: plan?.id ?? "plan",
      label: plan?.name ?? "Тариф не назначен",
      meta: parsedPlanFeatures.invalid ? "Поле features не является корректным JSON" : "У организации нет тарифа",
      href: "/superadmin/plans",
    }] : [],
  })

  addLimitIssue(issues, plan?.maxBuildings, buildingCount, "subscription-buildings-limit", "Превышен лимит зданий тарифа", "Зданий", "/admin/buildings")
  addLimitIssue(issues, plan?.maxTenants, activeTenantCount, "subscription-tenants-limit", "Превышен лимит арендаторов тарифа", "Арендаторов", "/admin/tenants")
  addLimitIssue(issues, plan?.maxUsers, activeUserCount, "subscription-users-limit", "Превышен лимит пользователей тарифа", "Пользователей", "/admin/users")
  addLimitIssue(issues, plan?.maxLeads, leadCount, "subscription-leads-limit", "Превышен лимит лидов тарифа", "Лидов", "/admin/leads")

  addIssue(issues, {
    key: "owner-missing",
    title: "В организации не найден активный владелец",
    description: "У каждой SaaS-организации должен быть ответственный owner. Он управляет подпиской, реквизитами, администраторами и критичными действиями.",
    severity: "critical",
    contour: "access",
    count: organization?.ownerUserId && ownerUser ? 0 : 1,
    actionLabel: "Проверить пользователей",
    href: "/admin/users",
    items: organization?.ownerUserId && ownerUser ? [] : [{
      id: "owner",
      label: organization?.name ?? "Организация",
      meta: organization?.ownerUserId ? "ownerUserId есть, но активный OWNER не найден" : "ownerUserId не заполнен",
      href: "/admin/users",
    }],
  })

  addIssue(issues, {
    key: "building-without-admin",
    title: "Здание без администратора",
    description: "Арендаторы должны общаться с администратором здания, а не с владельцем. У каждого активного здания лучше назначить ответственного администратора.",
    severity: "warning",
    contour: "access",
    count: buildingsWithoutAdminCount,
    actionLabel: "Назначить администратора",
    href: "/admin/buildings",
    items: buildingsWithoutAdmin.map((building) => ({
      id: building.id,
      label: building.name,
      meta: building.address,
      href: "/admin/buildings",
    })),
  })

  addIssue(issues, {
    key: "staff-without-building-scope",
    title: "Сотрудник без привязки к зданиям",
    description: "Если один администратор может вести несколько зданий, эта связь должна быть явной. Без нее сотрудник либо не увидит данные, либо будет требовать лишних исключений.",
    severity: "warning",
    contour: "access",
    count: staffWithoutScope.length,
    actionLabel: "Настроить доступы",
    href: "/admin/users",
    items: staffWithoutScope.slice(0, sampleLimit).map((user) => ({
      id: user.id,
      label: user.name,
      meta: `${displayRoleLabel(user.role)} · здания не назначены`,
      href: "/admin/users",
    })),
  })

  addIssue(issues, {
    key: "tenant-without-placement",
    title: "Арендатор без помещения или этажа",
    description: "Арендатор должен быть привязан к одному или нескольким помещениям либо этажам. Иначе ломаются начисления, заявки, документы и аналитика по зданию.",
    severity: "critical",
    contour: "tenant",
    count: tenantsWithoutPlacementCount,
    actionLabel: "Назначить площадь",
    href: "/admin/tenants",
    items: tenantsWithoutPlacement.map((tenant) => tenantItem(tenant, "Нет помещения, этажа или списка помещений")),
  })

  addIssue(issues, {
    key: "tenant-multiple-placement-conflict",
    title: "У арендатора смешаны разные типы размещения",
    description: "Можно иметь несколько помещений или несколько этажей, но нужно следить, чтобы старая связь spaceId не конфликтовала с новым списком помещений/этажей.",
    severity: "warning",
    contour: "tenant",
    count: tenantsWithMultiplePlacementCount,
    actionLabel: "Проверить карточку",
    href: "/admin/tenants",
    items: tenantsWithMultiplePlacement.map((tenant) => tenantItem(tenant, tenantPlacementLabel(tenant))),
  })

  addIssue(issues, {
    key: "tenant-dual-rent-method",
    title: "Два индивидуальных способа аренды",
    description: "У арендатора одновременно заполнены ставка за м² и фиксированная сумма. Правило должно быть только одно: ставка, фикс или ставка этажа.",
    severity: "critical",
    contour: "tenant",
    count: tenantsWithDualRentCount,
    actionLabel: "Исправить аренду",
    href: "/admin/tenants",
    items: tenantsWithDualRent.map((tenant) => tenantItem(
      tenant,
      `ставка ${formatMoney(tenant.customRate ?? 0)}/м² · фикс ${formatMoney(tenant.fixedMonthlyRent ?? 0)}/мес`,
    )),
  })

  addIssue(issues, {
    key: "tenant-missing-tax-id",
    title: "Не заполнен ИИН/БИН по правовой форме",
    description: "Для ИП/ЧСИ/физлица нужен ИИН, для ТОО/АО - БИН. Эти данные должны автоматически идти в договоры, счета, ЭСФ и реквизиты.",
    severity: "critical",
    contour: "legal",
    count: tenantsMissingTaxIdCount,
    actionLabel: "Заполнить реквизиты",
    href: "/admin/tenants",
    items: tenantsMissingTaxId.map((tenant) => tenantItem(tenant, `${tenant.legalType} · БИН ${tenant.bin || "-"} · ИИН ${tenant.iin || "-"}`)),
  })

  addIssue(issues, {
    key: "tenant-missing-bank-accounts",
    title: "У арендатора нет банковского счета",
    description: "Для договоров, актов сверки и входящих платежей лучше хранить один или несколько банковских счетов арендатора, а основной счет помечать отдельно.",
    severity: "info",
    contour: "finance",
    count: tenantsWithoutBankAccountsCount,
    actionLabel: "Добавить счет",
    href: "/admin/tenants",
    items: tenantsWithoutBankAccounts.map((tenant) => tenantItem(tenant, "Банковские счета не добавлены")),
  })

  addIssue(issues, {
    key: "occupied-without-tenant-link",
    title: "Помещение занято, но не связано с арендатором",
    description: "Статус помещения должен подтверждаться связью с арендатором, списком помещений или арендой целого этажа.",
    severity: "critical",
    contour: "tenant",
    count: occupiedWithoutTenantLinksCount,
    actionLabel: "Открыть помещения",
    href: "/admin/spaces",
    items: occupiedWithoutTenantLinks.map((space) => spaceItem(space, "занято без арендатора")),
  })

  addIssue(issues, {
    key: "vacant-with-tenant-link",
    title: "Помещение свободно, но связано с арендатором",
    description: "Такой конфликт ломает заполняемость и список свободных площадей. Освобождение помещения должно проходить через действие с подтверждением.",
    severity: "critical",
    contour: "tenant",
    count: vacantWithTenantLinksCount,
    actionLabel: "Проверить помещение",
    href: "/admin/spaces",
    items: vacantWithTenantLinks.map((space) => {
      const tenant = space.tenant ?? space.tenantSpaces[0]?.tenant ?? null
      return spaceItem(space, `свободно, но привязан ${tenant?.companyName ?? "арендатор"}`, tenant?.id)
    }),
  })

  addIssue(issues, {
    key: "full-floor-individual-space-conflict",
    title: "Этаж сдан целиком, но внутри есть отдельные связи помещений",
    description: "Если этаж закреплен за одним арендатором, отдельные помещения не должны случайно принадлежать другим арендаторам.",
    severity: "warning",
    contour: "tenant",
    count: fullFloorConflictCandidates.length,
    actionLabel: "Проверить этаж",
    href: "/admin/buildings",
    items: fullFloorConflictItems.map((floor) => ({
      id: floor.id,
      label: `${floor.building.name} · ${floor.name}`,
      meta: `Этаж: ${floor.fullFloorTenant?.companyName ?? "арендатор"} · внутри есть ${floor.spaces.length} связей помещений`,
      href: floor.fullFloorTenant ? `/admin/tenants/${floor.fullFloorTenant.id}` : "/admin/buildings",
    })),
  })

  addIssue(issues, {
    key: "addendum-without-parent",
    title: "Доп. соглашение не связано с основным договором",
    description: "Дополнительное соглашение должно ссылаться на базовый договор, иначе непонятно, какие условия оно меняет.",
    severity: "critical",
    contour: "legal",
    count: addendaWithoutParentCount,
    actionLabel: "Открыть договор",
    href: "/admin/documents",
    items: addendaWithoutParent.map((contract) => contractItem(contract, "нет parentContractId")),
  })

  addIssue(issues, {
    key: "signed-rent-addendum-not-applied",
    title: "Подписанное доп. соглашение не применено",
    description: "Если доп. соглашение по аренде подписано обеими сторонами, новые условия должны примениться один раз и получить appliedAt.",
    severity: "critical",
    contour: "legal",
    count: signedRentAddendaNotAppliedCount,
    actionLabel: "Применить изменения",
    href: "/admin/documents",
    items: signedRentAddendaNotApplied.map((contract) => contractItem(contract, "SIGNED · appliedAt пустой")),
  })

  addIssue(issues, {
    key: "tenant-without-signed-contract",
    title: "Арендатор без подписанного договора",
    description: "Для денег, помещения и изменения условий должен быть подписанный договор или доп. соглашение. Иначе юридический контур слабый.",
    severity: "warning",
    contour: "legal",
    count: tenantsWithoutSignedContractCount,
    actionLabel: "Создать договор",
    href: "/admin/tenants",
    items: tenantsWithoutSignedContract.map((tenant) => tenantItem(tenant, tenantPlacementLabel(tenant))),
  })

  addIssue(issues, {
    key: "confirmed-payment-report-without-payment",
    title: "Подтвержденная оплата не создала платеж",
    description: "После подтверждения чека должен появиться Payment, чтобы долг закрывался и акт сверки видел оплату.",
    severity: "critical",
    contour: "finance",
    count: confirmedReportsWithoutPaymentCount,
    actionLabel: "Проверить оплаты",
    href: "/admin/finances",
    items: confirmedReportsWithoutPayment.map((report) => paymentReportItem(report, "CONFIRMED без paymentId")),
  })

  addIssue(issues, {
    key: "stale-payment-report",
    title: "Оплата долго ждет проверки",
    description: "Если администратор не подтвердил или не отклонил чек, арендатор видит неопределенность, а долг может отображаться неверно.",
    severity: "warning",
    contour: "finance",
    count: stalePaymentReportsCount,
    actionLabel: "Проверить чеки",
    href: "/admin/finances",
    items: stalePaymentReports.map((report) => paymentReportItem(report, `ждет с ${formatDate(report.createdAt)}`)),
  })

  addIssue(issues, {
    key: "meter-without-current-reading",
    title: "Счетчик без показания за текущий период",
    description: "Коммунальные начисления не должны держаться в голове. Для активных счетчиков нужно вовремя вносить показания за месяц.",
    severity: "warning",
    contour: "utilities",
    count: metersWithoutCurrentReadingCount,
    actionLabel: "Внести показания",
    href: "/admin/meters",
    items: metersWithoutCurrentReading.map((meter) => meterItem(meter, `нет показания за ${currentPeriod}`)),
  })

  addIssue(issues, {
    key: "meter-on-vacant-space",
    title: "Счетчик привязан к свободному помещению",
    description: "Если помещение свободно, коммунальные начисления арендатору не должны появляться случайно. Проверьте статус или привязку счетчика.",
    severity: "info",
    contour: "utilities",
    count: metersOnVacantSpacesCount,
    actionLabel: "Проверить счетчики",
    href: "/admin/meters",
    items: metersOnVacantSpaces.map((meter) => meterItem(meter, "помещение свободно")),
  })

  addIssue(issues, {
    key: "meter-without-tariff",
    title: "Есть счетчики без тарифа в здании",
    description: "Для света, воды, отопления и других услуг нужен активный тариф здания. Иначе расход есть, а сумма начисления не рассчитывается.",
    severity: "warning",
    contour: "utilities",
    count: meterRowsWithoutTariff.length,
    actionLabel: "Настроить тарифы",
    href: "/admin/meters",
    items: meterRowsWithoutTariff.map((meter) => meterItem(meter, `нет тарифа ${meter.type}`)),
  })

  addIssue(issues, {
    key: "missing-document-templates",
    title: "Не хватает ключевых шаблонов документов",
    description: "Договор, счет, АВР и акт сверки должны формироваться из активных шаблонов организации, а не из статичного текста в коде.",
    severity: "critical",
    contour: "documents",
    count: missingTemplates.length,
    actionLabel: "Открыть шаблоны",
    href: "/admin/settings/document-templates",
    items: missingTemplates.map((type) => ({
      id: type,
      label: `Шаблон ${type}`,
      meta: "Активный шаблон не найден",
      href: "/admin/settings/document-templates",
    })),
  })

  addIssue(issues, {
    key: "generated-document-without-template",
    title: "Документы сформированы без ссылки на шаблон",
    description: "Для аудита важно знать, по какому шаблону создан документ. Старые документы без templateUsedId стоит постепенно пересоздать или пометить.",
    severity: "info",
    contour: "documents",
    count: generatedWithoutTemplateCount,
    actionLabel: "Открыть документы",
    href: "/admin/documents",
    items: generatedWithoutTemplate.map((document) => ({
      id: document.id,
      label: `${document.documentType} ${document.number ?? ""}`.trim(),
      meta: `${document.tenantName} · ${formatDate(document.generatedAt)} · templateUsedId пустой`,
      href: "/admin/documents",
    })),
  })

  addIssue(issues, {
    key: "expired-signature-request",
    title: "Просроченные запросы на подпись",
    description: "Если ссылка на подпись истекла, нужно отправить новую или закрыть запрос, чтобы статусы документов не зависали.",
    severity: "warning",
    contour: "documents",
    count: expiredSignatureRequestsCount,
    actionLabel: "Проверить подписи",
    href: "/admin/documents",
    items: expiredSignatureRequests.map((request) => signatureRequestItem(request, `истек ${request.expiresAt ? formatDate(request.expiresAt) : "без даты"}`)),
  })

  addIssue(issues, {
    key: "signed-request-without-signature",
    title: "Запрос помечен подписанным без подписи",
    description: "SIGNED-запрос должен иметь signatureId. Иначе статус говорит “подписано”, но криптографического следа нет.",
    severity: "critical",
    contour: "documents",
    count: signedRequestsWithoutSignatureCount,
    actionLabel: "Проверить подписи",
    href: "/admin/documents",
    items: signedRequestsWithoutSignature.map((request) => signatureRequestItem(request, "SIGNED без signatureId")),
  })

  addIssue(issues, {
    key: "tenant-storage-file-without-tenant",
    title: "Файл помечен как файл арендатора без tenantId",
    description: "Хранилище должно быть разделено по SaaS-организации и, где нужно, по арендатору. Иначе документы сложно найти и безопасно показывать.",
    severity: "warning",
    contour: "storage",
    count: orphanTenantFilesCount,
    actionLabel: "Открыть хранилище",
    href: "/admin/storage",
    items: orphanTenantFiles.map((file) => ({
      id: file.id,
      label: file.fileName,
      meta: `${file.category} · ${formatDate(file.createdAt)} · tenantId пустой`,
      href: "/admin/storage",
    })),
  })

  addIssue(issues, {
    key: "tenant-document-outside-storage",
    title: "Документ арендатора хранится старой ссылкой",
    description: "Новые документы и чеки должны храниться в DB Storage. Старые fileUrl без storageFileId лучше мигрировать, чтобы работали права доступа и резервное копирование.",
    severity: "info",
    contour: "storage",
    count: oldTenantDocumentsCount,
    actionLabel: "Открыть хранилище",
    href: "/admin/storage",
    items: oldTenantDocuments.map((document) => ({
      id: document.id,
      label: document.name,
      meta: `${document.tenant.companyName} · ${document.type} · storageFileId пустой`,
      href: `/admin/tenants/${document.tenant.id}`,
    })),
  })

  addIssue(issues, {
    key: "org-requisites-missing",
    title: "Не заполнены реквизиты арендодателя",
    description: "Реквизиты организации должны быть одним источником правды для договоров, счетов, ЭСФ, актов и платежных инструкций арендатора.",
    severity: "critical",
    contour: "legal",
    count: missingOrgRequisites.length > 0 ? 1 : 0,
    actionLabel: "Открыть настройки",
    href: "/admin/settings",
    items: missingOrgRequisites.length > 0 ? [{
      id: "org-requisites",
      label: organization?.name ?? "Организация",
      meta: `Не заполнено: ${missingOrgRequisites.join(", ")}`,
      href: "/admin/settings",
    }] : [],
  })

  addIssue(issues, {
    key: "server-errors-24h",
    title: "Есть серверные ошибки за 24 часа",
    description: "Ошибки должны попадать в понятный журнал поддержки: страница, пользователь, организация, действие и техническая причина.",
    severity: "critical",
    contour: "observability",
    count: serverErrorsCount,
    actionLabel: "Открыть журнал",
    href: "/admin/system-health",
    items: serverErrors.map((error) => ({
      id: error.id,
      label: error.route,
      meta: `${error.step ?? "route"} · ${formatDate(error.createdAt)} · ${error.error ?? "ошибка"}`,
      href: "/admin/system-health",
    })),
  })

  addIssue(issues, {
    key: "poor-web-vitals",
    title: "Есть плохие Core Web Vitals",
    description: "Если реальные пользователи получают poor LCP/INP/CLS, это нужно видеть не только в Google, но и в кабинете поддержки.",
    severity: "warning",
    contour: "observability",
    count: poorWebVitalCount,
    actionLabel: "Открыть скорость",
    href: "/superadmin/performance",
    items: poorWebVitals.map((metric) => ({
      id: metric.id,
      label: `${metric.name}: ${Math.round(metric.value)}`,
      meta: `${metric.path ?? "страница не указана"} · ${formatDate(metric.createdAt)}`,
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
  title: string,
  label: string,
  href: string,
) {
  if (!limit || used <= limit) return
  addIssue(issues, {
    key,
    title,
    description: "Фактическое использование превышает лимит тарифа. Superadmin должен либо расширить тариф, либо владелец должен перейти на другой план.",
    severity: "warning",
    contour: "subscription",
    count: used - limit,
    actionLabel: "Проверить тариф",
    href,
    items: [{
      id: key,
      label,
      meta: `Используется ${used}, лимит ${limit}`,
      href,
    }],
  })
}

function tenantItem(tenant: TenantListRow, meta: string): RelationshipIntegrityItem {
  return {
    id: tenant.id,
    label: tenant.companyName,
    meta,
    href: `/admin/tenants/${tenant.id}`,
  }
}

function spaceItem(space: SpaceListRow, meta: string, tenantId?: string): RelationshipIntegrityItem {
  return {
    id: space.id,
    label: `${space.floor.building.name} · ${space.floor.name} · каб. ${space.number}`,
    meta: `${meta} · ${space.area} м²`,
    href: tenantId ? `/admin/tenants/${tenantId}` : "/admin/spaces",
  }
}

function contractItem(contract: ContractListRow, meta: string): RelationshipIntegrityItem {
  return {
    id: contract.id,
    label: `Договор № ${contract.number}`,
    meta: `${contract.tenant.companyName} · ${contract.changeKind ?? "изменение"} · ${meta}`,
    href: `/admin/tenants/${contract.tenant.id}`,
  }
}

function paymentReportItem(report: PaymentReportListRow, meta: string): RelationshipIntegrityItem {
  return {
    id: report.id,
    label: `${report.tenant.companyName} · ${formatMoney(report.amount)}`,
    meta,
    href: `/admin/tenants/${report.tenant.id}`,
  }
}

function meterItem(meter: MeterListRow, meta: string): RelationshipIntegrityItem {
  return {
    id: meter.id,
    label: `${meter.space.floor.building.name} · ${meter.space.floor.name} · каб. ${meter.space.number}`,
    meta: `${meter.type} ${meter.number} · ${meta}`,
    href: "/admin/meters",
  }
}

function signatureRequestItem(request: SignatureRequestListRow, meta: string): RelationshipIntegrityItem {
  return {
    id: request.id,
    label: request.title,
    meta: `${request.documentType} ${request.documentRef ?? ""}`.trim() + ` · ${meta}`,
    href: "/admin/documents",
  }
}

function tenantPlacementLabel(tenant: TenantListRow) {
  const parts: string[] = []
  if (tenant.space) parts.push(`каб. ${tenant.space.number}`)
  if (tenant.tenantSpaces.length > 0) parts.push(`${tenant.tenantSpaces.length} помещ.`)
  if (tenant.fullFloors.length > 0) parts.push(`${tenant.fullFloors.length} этаж.`)
  return parts.length > 0 ? parts.join(" · ") : "Размещение не указано"
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
} | null) {
  if (!org) return ["организация"]
  const missing: string[] = []
  if (!org.legalType) missing.push("правовая форма")
  if (!org.legalName) missing.push("полное название")
  if (["TOO", "ТОО", "AO", "АО"].includes(org.legalType ?? "") && !org.bin) missing.push("БИН")
  if (["IP", "ИП", "CHSI", "ЧСИ"].includes(org.legalType ?? "") && !org.iin) missing.push("ИИН")
  if (!org.directorName) missing.push("руководитель")
  if (!org.directorPosition) missing.push("должность")
  if (!org.basis) missing.push("основание действия")
  if (!org.legalAddress) missing.push("юридический адрес")
  if (!org.bankName) missing.push("банк")
  if (!org.iik) missing.push("ИИК")
  if (!org.bik) missing.push("БИК")
  if (!org.phone) missing.push("телефон")
  if (!org.email) missing.push("email")
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
  return (Object.keys(CONTOUR_META) as RelationshipContour[])
    .map((key) => {
      const contourIssues = issues.filter((issue) => issue.contour === key)
      return {
        key,
        label: CONTOUR_META[key].label,
        description: CONTOUR_META[key].description,
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
