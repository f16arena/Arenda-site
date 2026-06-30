export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import Link from "next/link"
import { Wand2, Users, AlertTriangle, Wallet, CircleCheck } from "lucide-react"
import { formatMoney } from "@/lib/utils"
import { PageHeader, StatGrid, StatCard } from "@/components/ui/page"
import { TenantDialog } from "./tenant-dialog"
import { BulkNotifyButton } from "./bulk-notify-button"
import { TenantsTableLoader } from "./tenants-table-loader"
import type { TenantRow } from "./tenants-table"
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

  const tenantWhere = buildingId
    ? {
        OR: [
          { space: { floor: { buildingId } } },
          { tenantSpaces: { some: { space: { floor: { buildingId } } } } },
          { fullFloors: { some: { buildingId } } },
          { spaceId: null, user: { organizationId: orgId } },
        ],
      }
    : {
        OR: [
          { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
          { tenantSpaces: { some: { space: { floor: { buildingId: { in: visibleBuildingIds } } } } } },
          { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
          { spaceId: null, user: { organizationId: orgId } },
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
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                title="Заселение за 3 шага: контакты → помещение и условия → договор"
              >
                <Wand2 className="h-4 w-4" />
                Мастер заселения
              </Link>
            )}
            {allowedCapabilities.has("tenants.create") && (
              <TenantDialog
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
        <StatCard icon={Users} label="Всего арендаторов" value={totalTenants} tone="blue" />
        <StatCard
          icon={AlertTriangle}
          label="С долгом"
          value={debtorsCount}
          sub={debtorsCount > 0 ? `${Math.round((debtorsCount / Math.max(totalTenants, 1)) * 100)}% от всех` : "все платят вовремя"}
          tone={debtorsCount > 0 ? "amber" : "slate"}
        />
        <StatCard
          icon={Wallet}
          label="Сумма долга"
          value={formatMoney(totalDebt)}
          sub="неоплаченные начисления"
          tone={totalDebt > 0 ? "red" : "slate"}
        />
        <StatCard
          icon={CircleCheck}
          label="Без долга"
          value={Math.max(totalTenants - debtorsCount, 0)}
          tone="emerald"
        />
      </StatGrid>

      <TenantsTableLoader tenants={rows} canDelete={allowedCapabilities.has("tenants.delete")} />
      <PaginationControls
        basePath="/admin/tenants"
        page={page}
        pageSize={TENANTS_PAGE_SIZE}
        total={totalTenants}
      />
    </div>
  )
}
