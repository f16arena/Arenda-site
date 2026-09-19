export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import Link from "next/link"
import { Suspense } from "react"
import { Wand2, Users, Wallet, CalendarClock, FileWarning } from "lucide-react"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { formatMoney } from "@/lib/utils"
import { PageHeader, StatGrid, StatCard } from "@/components/ui/page"
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
        contracts: { where: { status: "SIGNED", deletedAt: null }, select: { id: true }, take: 1 },
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

  const tenantIds = tenants.map((t) => t.id)
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
      floor: { select: { name: true, kind: true, building: { select: { name: true } } } },
    },
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  })

  const rows: TenantRow[] = tenants.map((t) => ({
    id: t.id,
    companyName: t.companyName,
    legalType: t.legalType,
    bin: t.bin,
    iin: t.iin,
    category: t.category,
    placementNote: t.placementNote,
    user: { name: t.user.name, phone: t.user.phone, email: t.user.email },
    space: t.space,
    tenantSpaces: t.tenantSpaces,
    fullFloors: t.fullFloors.map((f) => ({
      id: f.id,
      name: f.name,
      totalArea: f.totalArea,
      fixedMonthlyRent: f.fixedMonthlyRent,
    })),
    debt: debtMap.get(t.id) ?? 0,
    rent: calculateTenantMonthlyRent(t),
    contractEnd: t.contractEnd ? t.contractEnd.toISOString() : null,
    hasSignedContract: t.contracts.length > 0,
  }))

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title="Арендаторы"
        subtitle={`${totalTenants} зарегистрировано`}
        actions={
          <>
            {allowedCapabilities.has("messages.send") && (
              <BulkNotifyButton available={bulkNotificationsAvailable} totalTenants={totalTenants} />
            )}
            {allowedCapabilities.has("tenants.create") && (
              <Link
                href="/admin/tenants/new"
                className="order-last inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                title="Заселение за 3 шага: контакты → помещение и условия → договор"
              >
                <Wand2 className="h-4 w-4" />
                Заселить арендатора
              </Link>
            )}
            {allowedCapabilities.has("tenants.create") && (
              <TenantDialog
                label="Только карточка"
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
        <StatCard icon={Users} label="Арендаторов" value={totalTenants} tone="blue" sub={buildingId ? "в выбранном здании" : "во всех зданиях"} />
        <StatCard
          icon={Wallet}
          label="Долг"
          value={formatMoney(totalDebt)}
          sub={debtorsCount > 0 ? `у ${debtorsCount} арендатор${debtorsCount === 1 ? "а" : "ов"}` : "все платят вовремя"}
          tone={totalDebt > 0 ? "red" : "emerald"}
          href={totalDebt > 0 ? "/admin/tenants?debt=debt" : undefined}
        />
        <StatCard
          icon={CalendarClock}
          label="Договор кончается"
          value={expiringCount}
          sub="в ближайшие 60 дней — продлите заранее"
          tone={expiringCount > 0 ? "amber" : "slate"}
          href={expiringCount > 0 ? "/admin/tenants?contract=expiring" : undefined}
        />
        <StatCard
          icon={FileWarning}
          label="Без подписанного договора"
          value={unsignedCount}
          sub={unsignedCount > 0 ? "счета по ним выставить нельзя" : "у всех есть договор"}
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
