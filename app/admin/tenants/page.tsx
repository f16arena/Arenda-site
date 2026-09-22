export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { Suspense } from "react"
import { Users, Wallet, CalendarClock, FileWarning } from "lucide-react"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatMoneyL } from "@/lib/i18n/format"
import { PageHeader, StatGrid, StatCard } from "@/components/ui/page"
import { MoveInTenantButton } from "./move-in-button"
import { TenantDialog } from "./tenant-dialog"
import { BulkNotifyButton } from "./bulk-notify-button"
import { TenantsTable, type TenantRow } from "./tenants-table"
import { requireOrgAccess } from "@/lib/org"
import { spaceScope } from "@/lib/tenant-scope"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { normalizePage, pageSkip } from "@/lib/pagination"

const TENANTS_PAGE_SIZE = 50

type TenantsPageProps = {
  searchParams?: Promise<{ page?: string | string[] }>
}

export default async function TenantsPage(props: TenantsPageProps) {
  const locale = await getLocale()
  const { t, tp } = await getT(locale)
  const { orgId } = await requireOrgAccess()
  const session = await auth()
  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds
  // Фича-флаг bulkNotifications из тарифа (для показа кнопки рассылки).
  const orgForFeatures = await db.organization.findUnique({ where: { id: orgId }, select: { plan: { select: { features: true } } } })
  let bulkNotificationsAvailable = false
  try {
    bulkNotificationsAvailable = JSON.parse(orgForFeatures?.plan?.features ?? "{}")?.bulkNotifications === true
  } catch { /* ignore */ }
  const allowedCapabilities = session?.user
    ? new Set(await getAllowedCapabilityKeysForUser({
        userId: session.user.id,
        role: session.user.role,
        isPlatformOwner: !!session.user.isPlatformOwner,
        orgId,
      }))
    : new Set<string>()

  const sp = await props.searchParams
  const page = normalizePage(sp?.page)

  // Арендатор в здании — любым из четырёх путей привязки. Раньше сюда шёл любой
  // арендатор без основного помещения (spaceId = null), а у арендатора с
  // несколькими помещениями основного нет — он всплывал в чужом здании.
  // Совсем не назначенные (ни помещения, ни этажа, ни здания) видны везде.
  const inVisible = { in: visibleBuildingIds }
  const tenantWhere = {
    user: { organizationId: orgId },
    OR: [
      { space: { floor: { buildingId: inVisible } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: inVisible } } } } },
      { fullFloors: { some: { buildingId: inVisible } } },
      { buildingId: inVisible },
      { spaceId: null, buildingId: null, tenantSpaces: { none: {} }, fullFloors: { none: {} } },
    ],
  }

  // Все арендаторы текущей организации — включая ещё не назначенных на помещение,
  // но привязанных через user.organizationId (если spaceId = null).
  // Долги вынесены в отдельный groupBy-запрос ниже — это резко уменьшает payload
  // (раньше charges подгружались полностью на каждого арендатора).
  const [tenants, totalTenants] = await Promise.all([
    db.tenant.findMany({
      where: tenantWhere,
      select: {
        id: true,
        companyName: true,
        legalType: true,
        bin: true,
        iin: true,
        category: true,
        placementNote: true,
        contractEnd: true,
        customRate: true,
        fixedMonthlyRent: true,
        rentSchedule: true,
        contracts: {
          where: { deletedAt: null, type: { not: "ADDENDUM" }, status: { in: ["SIGNED", "SENT", "SIGNED_BY_TENANT", "DRAFT"] } },
          select: { status: true },
          orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
        user: { select: { name: true, phone: true, email: true } },
        space: {
          select: {
            id: true,
            number: true,
            area: true,
            floor: { select: { name: true, ratePerSqm: true } },
          },
        },
        tenantSpaces: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            isPrimary: true,
            space: {
              select: {
                id: true,
                number: true,
                area: true,
                floor: { select: { name: true, ratePerSqm: true } },
              },
            },
          },
        },
        // Этажи, где этот арендатор сдан целиком — обратное отношение через Floor.fullFloorTenantId
        fullFloors: {
          select: {
            id: true,
            name: true,
            totalArea: true,
            fixedMonthlyRent: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: pageSkip(page, TENANTS_PAGE_SIZE),
      take: TENANTS_PAGE_SIZE,
    }),
    db.tenant.count({ where: tenantWhere }),
  ])

  const tenantIds = tenants.map((item) => item.id)
  const debtRows = tenantIds.length > 0
    ? await db.charge.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds }, isPaid: false },
        _sum: { amount: true },
      })
    : []
  const debtMap = new Map(debtRows.map((row) => [row.tenantId, row._sum.amount ?? 0]))

  // Сводка по долгам по всей видимой базе (а не только по текущей странице) — для карточек метрик.
  const debtAgg = await db.charge.groupBy({
    by: ["tenantId"],
    where: { isPaid: false, tenant: tenantWhere },
    _sum: { amount: true },
  })
  const debtorsCount = debtAgg.filter((row) => (row._sum.amount ?? 0) > 0).length
  const totalDebt = debtAgg.reduce((sum, row) => sum + (row._sum.amount ?? 0), 0)

  const today = new Date()
  const in60Days = new Date(today.getTime() + 60 * 24 * 3600 * 1000)
  const [expiringCount, unsignedCount] = await Promise.all([
    db.tenant.count({ where: { AND: [tenantWhere, { contractEnd: { gte: today, lte: in60Days } }] } }),
    db.tenant.count({ where: { AND: [tenantWhere, { contracts: { none: { status: "SIGNED", deletedAt: null } } }] } }),
  ])

  const vacantSpaces = await db.space.findMany({
    where: {
      AND: [
        spaceScope(orgId),
        // RENTABLE — обычные помещения; OBJECT — объекты крыши/территории (без м²).
        { status: "VACANT", kind: { in: ["RENTABLE", "OBJECT"] } },
        { tenantSpaces: { none: {} } },
        { tenant: null },
        { floor: { buildingId: { in: visibleBuildingIds } } },
      ],
    },
    select: {
      id: true,
      number: true,
      area: true,
      kind: true,
      floor: { select: { name: true, kind: true, ratePerSqm: true, building: { select: { id: true, name: true } } } },
    },
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  })

  const rows: TenantRow[] = tenants.map((item) => ({
    id: item.id,
    companyName: item.companyName,
    legalType: item.legalType,
    bin: item.bin,
    iin: item.iin,
    category: item.category,
    placementNote: item.placementNote,
    user: { name: item.user.name, phone: item.user.phone, email: item.user.email },
    space: item.space,
    tenantSpaces: item.tenantSpaces,
    fullFloors: item.fullFloors.map((f) => ({
      id: f.id,
      name: f.name,
      totalArea: f.totalArea,
      fixedMonthlyRent: f.fixedMonthlyRent,
    })),
    debt: debtMap.get(item.id) ?? 0,
    rent: calculateTenantMonthlyRent(item),
    contractEnd: item.contractEnd ? item.contractEnd.toISOString() : null,
    hasSignedContract: item.contracts[0]?.status === "SIGNED",
    // Договор может быть уже отправлен и ждать подписи — это не то же самое,
    // что «договора нет»: второй создавать не нужно.
    contractStatus: item.contracts[0]?.status ?? null,
  }))

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title={t("adminTenants.list.title")}
        subtitle={t("adminTenants.list.subtitle", { count: totalTenants })}
        actions={
          <>
            {allowedCapabilities.has("messages.send") && (
              <BulkNotifyButton available={bulkNotificationsAvailable} totalTenants={totalTenants} />
            )}
            {allowedCapabilities.has("tenants.create") && (
              <MoveInTenantButton
                vacantSpaces={vacantSpaces
                  .filter((sp) => sp.kind === "RENTABLE")
                  .map((sp) => ({
                    id: sp.id,
                    number: sp.number,
                    area: sp.area,
                    floorName: sp.floor.name,
                    ratePerSqm: sp.floor.ratePerSqm,
                    buildingId: sp.floor.building.id,
                    buildingName: sp.floor.building.name,
                  }))}
              />
            )}
            {allowedCapabilities.has("tenants.create") && (
              <TenantDialog
                label={t("adminTenants.list.onlyCard")}
                variant="outline"
                buildingId={buildingId}
                vacantSpaces={vacantSpaces.map((s) => ({
                  id: s.id,
                  number: s.number,
                  floorName: s.floor.name,
                  buildingName: s.floor.building.name,
                  area: s.area,
                  isObject: s.kind === "OBJECT" || s.floor.kind === "ROOF" || s.floor.kind === "TERRITORY",
                }))}
              />
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard
          icon={Users}
          label={t("adminTenants.list.stats.tenants")}
          value={totalTenants}
          tone="blue"
          sub={buildingId ? t("adminTenants.list.stats.inBuilding") : t("adminTenants.list.stats.allBuildings")}
        />
        <StatCard
          icon={Wallet}
          label={t("adminTenants.list.stats.debt")}
          value={formatMoneyL(locale, totalDebt)}
          sub={debtorsCount > 0 ? tp("adminTenants.list.stats.debtors", debtorsCount) : t("adminTenants.list.stats.noDebtors")}
          tone={totalDebt > 0 ? "red" : "emerald"}
          href={totalDebt > 0 ? "/admin/tenants?debt=debt" : undefined}
        />
        <StatCard
          icon={CalendarClock}
          label={t("adminTenants.list.stats.expiring")}
          value={expiringCount}
          sub={t("adminTenants.list.stats.expiringHint")}
          tone={expiringCount > 0 ? "amber" : "slate"}
          href={expiringCount > 0 ? "/admin/tenants?contract=expiring" : undefined}
        />
        <StatCard
          icon={FileWarning}
          label={t("adminTenants.list.stats.unsigned")}
          value={unsignedCount}
          sub={unsignedCount > 0 ? t("adminTenants.list.stats.unsignedHint") : t("adminTenants.list.stats.allSigned")}
          tone={unsignedCount > 0 ? "amber" : "emerald"}
          href={unsignedCount > 0 ? "/admin/tenants?contract=none" : undefined}
        />
      </StatGrid>

      <Suspense fallback={null}>
        <TenantsTable tenants={rows} canDelete={allowedCapabilities.has("tenants.delete")} />
      </Suspense>
      <PaginationControls
        basePath="/admin/tenants"
        page={page}
        pageSize={TENANTS_PAGE_SIZE}
        total={totalTenants}
      />
    </div>
  )
}
