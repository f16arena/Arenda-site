export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatDateShortL, formatMoneyL, formatNumberL } from "@/lib/i18n/format"
import { INTL_LOCALE, type Locale } from "@/lib/i18n/config"
import { Building2, Box, UserPlus, DoorOpen, DoorClosed, Wallet, Map as MapIcon } from "lucide-react"
import { isObjectSpace, isZoneFloor } from "@/lib/zone-kinds"
import { shortCompanyName } from "@/lib/company-name"
import { SpacesBoard, type SpaceRow, type FloorGroup } from "./spaces-board"
import Link from "next/link"
import { AddSpaceDialog, EditSpaceDialog, DeleteSpaceButton } from "./space-actions"
import { KrishaListingButton } from "./krisha-listing-button"
import { getCityMedianPerSqm } from "@/lib/market"
import { WipeAllSpacesButton } from "./wipe-all-button"
import { UnassignFloorButton } from "./unassign-floor-button"
import { hasFeature } from "@/lib/plan-features"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { switchBuilding } from "@/app/actions/buildings"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import { safeServerValue } from "@/lib/server-fallback"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader, StatGrid, StatCard } from "@/components/ui/page"

type SafeQuery = <T>(source: string, promise: Promise<T>, fallback: T) => Promise<T>

type OverviewBuilding = {
  id: string
  name: string
  address: string
  floors: Array<{
    id: string
    name: string
    number: number
    totalArea: number | null
    ratePerSqm: number
  }>
}

type SpaceTenantInfo = {
  id: string
  companyName: string
  contractEnd: Date | null
  customRate: number | null
  fixedMonthlyRent: number | null
  fullFloors: Array<{ fixedMonthlyRent: number | null }>
  tenantSpaces: Array<{ space: { area: number; floor: { ratePerSqm: number } } }>
}

type SelectedSpaceInfo = {
  id: string
  number: string
  area: number
  status: string
  kind: string
  description: string | null
  photos: string | null
  tenant: SpaceTenantInfo | null
  tenantSpaces: Array<{ tenant: SpaceTenantInfo }>
}

type SelectedFloorInfo = {
  id: string
  number: number
  name: string
  kind: string
  ratePerSqm: number
  totalArea: number | null
  fullFloorTenant: { id: string; companyName: string; contractEnd: Date | null } | null
  spaces: SelectedSpaceInfo[]
}

type SelectedBuildingInfo = {
  id: string
  name: string
  address: string
  totalArea: number | null
  floors: SelectedFloorInfo[]
}

export default async function SpacesPage() {
  return measureServerRoute("/admin/spaces", async () => {
  const locale = await getLocale()
  const { t, tp } = await getT(locale)
  const money = (amount: number) => formatMoneyL(locale, amount)
  const { orgId } = await requireOrgAccess()
  const session = await auth()
  const allowedCapabilities = session?.user
    ? new Set(await getAllowedCapabilityKeysForUser({
        userId: session.user.id,
        role: session.user.role,
        isPlatformOwner: !!session.user.isPlatformOwner,
        orgId,
      }))
    : new Set<string>()
  const canEditSpaces = allowedCapabilities.has("spaces.edit")
  const canDeleteSpaces = allowedCapabilities.has("spaces.delete")
  const canAssignSpaces = allowedCapabilities.has("spaces.assignTenant")
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/spaces", orgId })
  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)

  if (!buildingId) {
    if (accessibleBuildingIds.length === 0) {
      return (
        <div className="space-y-5">
          <PageHeader icon={Building2} title={t("adminObjects.spaces.title")} subtitle={t("adminObjects.spaces.subtitle")} />
          <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 p-8 text-center">
            <Building2 className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
              {t("adminObjects.spaces.noBuildingTitle")}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-md mx-auto">
              {t("adminObjects.spaces.noBuildingText")}
            </p>
            <Link
              href="/admin/buildings"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white"
            >
              <Building2 className="h-4 w-4" />
              {t("adminObjects.spaces.noBuildingLink")}
            </Link>
          </div>
        </div>
      )
    }

    const buildings = await measureServerStep(
      "/admin/spaces",
      "building-overview",
      getOverviewBuildings(orgId, accessibleBuildingIds, safe),
    )
    const floorIds = buildings.flatMap((building) => building.floors.map((floor) => floor.id))
    const spaceStats = floorIds.length > 0
      ? await safe(
          "admin.spaces.spaceStats",
          db.space.groupBy({
            by: ["floorId", "status"],
            where: { floorId: { in: floorIds }, kind: { not: "COMMON" } },
            _count: { _all: true },
            _sum: { area: true },
          }),
          [] as Array<{
          floorId: string
          status: string
          _count: { _all: number }
          _sum: { area: number | null }
        }>,
        )
      : []

    const statsByFloorId = new Map<string, (typeof spaceStats)[number][]>()
    for (const stat of spaceStats) {
      const floorStats = statsByFloorId.get(stat.floorId)
      if (floorStats) {
        floorStats.push(stat)
      } else {
        statsByFloorId.set(stat.floorId, [stat])
      }
    }

    const buildingSummaries = buildings.map((building) => {
      const floorSummaries = building.floors.map((floor) => {
        const stats = statsByFloorId.get(floor.id) ?? []
        const totalSpaces = stats.reduce((sum, item) => sum + item._count._all, 0)
        const occupied = stats.find((item) => item.status === "OCCUPIED")?._count._all ?? 0
        const vacant = stats.find((item) => item.status === "VACANT")?._count._all ?? 0
        const area = stats.reduce((sum, item) => sum + (item._sum.area ?? 0), 0)

        return {
          id: floor.id,
          name: floor.name,
          ratePerSqm: floor.ratePerSqm,
          totalSpaces,
          occupied,
          vacant,
          area,
        }
      })
      const totalSpaces = floorSummaries.reduce((sum, floor) => sum + floor.totalSpaces, 0)
      const occupied = floorSummaries.reduce((sum, floor) => sum + floor.occupied, 0)
      const vacant = floorSummaries.reduce((sum, floor) => sum + floor.vacant, 0)
      const area = floorSummaries.reduce((sum, floor) => sum + floor.area, 0)

      return {
        id: building.id,
        name: building.name,
        address: building.address,
        floorsCount: floorSummaries.length,
        floorSummaries,
        totalSpaces,
        occupied,
        vacant,
        area,
      }
    })
    const rentableSpacesCount = buildingSummaries.reduce((sum, building) => sum + building.totalSpaces, 0)
    const occupied = buildingSummaries.reduce((sum, building) => sum + building.occupied, 0)
    const vacant = buildingSummaries.reduce((sum, building) => sum + building.vacant, 0)
    const totalArea = buildingSummaries.reduce((sum, building) => sum + building.area, 0)

    return (
      <div className="space-y-5">
        <PageHeader
          icon={Building2}
          title={t("adminObjects.spaces.title")}
          subtitle={tp("adminObjects.spaces.allBuildings", buildings.length)}
        />

        <StatGrid>
          <StatCard label={t("adminObjects.spaces.statBuildings")} value={buildings.length} />
          <StatCard label={t("adminObjects.spaces.statSpaces")} value={rentableSpacesCount} />
          <StatCard label={t("adminObjects.spaces.statOccupied")} value={occupied} tone="blue" />
          <StatCard label={t("adminObjects.spaces.statVacant")} value={vacant} tone="emerald" />
        </StatGrid>

        <Card className="block rounded-2xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminObjects.spaces.rentableArea")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{formatNumberL(locale, totalArea, 1)} м²</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {t("adminObjects.spaces.rentableAreaHint")}
          </p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {buildingSummaries.map((building) => (
            <Card key={building.id} className="block rounded-2xl p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{building.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{building.address}</p>
                </div>
                <form
                  action={async () => {
                    "use server"
                    await switchBuilding(building.id)
                  }}
                >
                  <Button type="submit" variant="outline" size="sm" className="font-medium">
                    {t("adminObjects.spaces.open")}
                  </Button>
                </form>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{building.floorsCount}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("adminObjects.spaces.shortFloors")}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{building.totalSpaces}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("adminObjects.spaces.shortSpaces")}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-500/10">
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{building.occupied}</p>
                  <p className="text-[10px] text-blue-700 dark:text-blue-300">{t("adminObjects.spaces.shortOccupied")}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-500/10">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{building.vacant}</p>
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-300">{t("adminObjects.spaces.shortVacant")}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {building.floorSummaries.slice(0, 6).map((floor) => (
                  <div key={floor.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800 dark:text-slate-200">{floor.name}</p>
                      <p className="text-slate-400 dark:text-slate-500">{money(floor.ratePerSqm)}/м²</p>
                    </div>
                    <div className="text-right text-slate-500 dark:text-slate-400">
                      <p>{t("adminObjects.spaces.floorLine", { count: floor.totalSpaces, area: formatNumberL(locale, floor.area, 1) })}</p>
                      <p>{t("adminObjects.spaces.floorOccupancy", { occupied: floor.occupied, vacant: floor.vacant })}</p>
                    </div>
                  </div>
                ))}
                {building.floorSummaries.length > 6 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {tp("adminObjects.spaces.moreFloors", building.floorSummaries.length - 6)}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const [building, hasFloorEditor] = buildingId
    ? await measureServerStep("/admin/spaces", "selected-building", Promise.all([
        getSelectedBuilding(buildingId, safe),
        hasFeature(orgId, "floorEditor"),
      ]))
    : [null, await hasFeature(orgId, "floorEditor")]
  const floors = building?.floors ?? []
  const allSpaces = floors.flatMap((f) => f.spaces)
  // Помещения — то, что сдаётся по площади. Общие зоны не сдаются; места-объекты
  // на крыше и территории (антенны, киоск) — отдельный блок ниже.
  const isObjectRow = (floorKind: string, spaceKind: string) => isZoneFloor(floorKind) || isObjectSpace(spaceKind)
  const roomFloors = floors.filter((f) => !isZoneFloor(f.kind))
  const zoneFloors = floors.filter((f) => isZoneFloor(f.kind) || f.spaces.some((s) => isObjectSpace(s.kind)))
  const marketPerSqm = building ? await getCityMedianPerSqm([building.id]).catch(() => null) : null
  const floorOptions = floors.map((f) => ({
    id: f.id,
    name: f.name,
    number: f.number,
    kind: f.kind,
    totalArea: f.totalArea,
    usedArea: f.spaces.reduce((s, sp) => s + sp.area, 0),
  }))
  const assignableTenants: Array<{ id: string; companyName: string; placement: string | null }> = []

  // Аренда арендатора — одна на всё, что он снимает: доход считаем по арендатору
  // один раз, а в строке помещения пишем «за все N помещений».
  const tenantRent = new Map<string, { rent: number; spaces: number }>()
  const rowsRaw: Array<{ floor: SelectedFloorInfo; space: SelectedSpaceInfo; tenant: SpaceTenantInfo | null }> = []
  for (const floor of floors) {
    for (const space of floor.spaces) {
      if (space.kind === "COMMON") continue
      const tenant = space.tenantSpaces[0]?.tenant ?? space.tenant
      rowsRaw.push({ floor, space, tenant })
      if (tenant) {
        const cur = tenantRent.get(tenant.id)
        if (cur) cur.spaces += 1
        else tenantRent.set(tenant.id, {
          rent: calculateTenantMonthlyRent({
            customRate: tenant.customRate,
            fixedMonthlyRent: tenant.fixedMonthlyRent,
            fullFloors: tenant.fullFloors,
            tenantSpaces: tenant.tenantSpaces,
            space: { area: space.area, floor: { ratePerSqm: floor.ratePerSqm } },
          }),
          spaces: 1,
        })
      }
    }
  }

  const actionsFor = (space: SelectedSpaceInfo, tenant: SpaceTenantInfo | null, fullFloorTenant: SelectedFloorInfo["fullFloorTenant"]) => {
    const displayTenant = tenant ?? fullFloorTenant
    const occupancyTenant = tenant
      ? { id: tenant.id, companyName: tenant.companyName }
      : fullFloorTenant
        ? { id: fullFloorTenant.id, companyName: t("adminObjects.spaces.wholeFloorSuffix", { name: fullFloorTenant.companyName }) }
        : null
    return (
      <>
        {space.status === "VACANT" && !displayTenant && canAssignSpaces && (
          <Link href={`/admin/tenants/new?space=${space.id}`} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700">
            <UserPlus className="h-3.5 w-3.5" /> {t("adminObjects.spaces.moveIn")}
          </Link>
        )}
        {space.status === "VACANT" && !displayTenant && canEditSpaces && <KrishaListingButton spaceId={space.id} />}
        {canEditSpaces && (
          <EditSpaceDialog
            space={{ id: space.id, number: space.number, area: space.area, status: space.status, description: space.description, photos: space.photos, tenant: occupancyTenant }}
            tenants={canAssignSpaces ? assignableTenants : []}
            buildingId={building?.id}
          />
        )}
        {canDeleteSpaces && <DeleteSpaceButton spaceId={space.id} hasTenant={!!displayTenant} />}
      </>
    )
  }

  const toRow = ({ floor, space, tenant }: (typeof rowsRaw)[number]): SpaceRow => {
    const fullFloorTenant = floor.fullFloorTenant
    const shown = tenant ?? fullFloorTenant
    const tr = tenant ? tenantRent.get(tenant.id) : null
    const vacant = !shown && space.status === "VACANT"
    return {
      id: space.id,
      number: space.number,
      floorId: floor.id,
      area: space.area,
      status: shown ? "OCCUPIED" : space.status,
      description: space.description,
      tenant: shown
        ? { id: shown.id, name: shortCompanyName(shown.companyName), contractEnd: shown.contractEnd ? new Date(shown.contractEnd).toISOString() : null, wholeFloor: !tenant }
        : null,
      rent: tr ? tr.rent : space.area * floor.ratePerSqm,
      rentNote: tr && tr.spaces > 1
        ? tp("adminObjects.spaces.rentNoteShared", tr.spaces)
        : !shown ? t("adminObjects.spaces.rentNoteFloorRate") : null,
      marketHint: vacant && marketPerSqm
        ? t("adminObjects.spaces.marketHint", { amount: formatNumberL(locale, marketPerSqm) })
        : null,
      actions: actionsFor(space, tenant, fullFloorTenant),
    }
  }

  const roomRows = rowsRaw.filter((r) => !isObjectRow(r.floor.kind, r.space.kind)).map(toRow)
  const objectRows = rowsRaw.filter((r) => isObjectRow(r.floor.kind, r.space.kind)).map(toRow)

  // Главные цифры — по помещениям (объекты на крыше/территории площадью не меряются)
  const occupiedRows = roomRows.filter((r) => r.status === "OCCUPIED")
  const vacantRows = roomRows.filter((r) => r.status !== "OCCUPIED")
  const roomArea = roomRows.reduce((s, r) => s + r.area, 0)
  const occupiedArea = occupiedRows.reduce((s, r) => s + r.area, 0)
  const vacantArea = vacantRows.reduce((s, r) => s + r.area, 0)
  const occupancyByArea = roomArea > 0 ? Math.round((occupiedArea / roomArea) * 100) : 0
  const income = [...tenantRent.values()].reduce((s, t) => s + t.rent, 0)
  const idleLoss = vacantRows.reduce((s, r) => s + r.rent, 0)

  const wholeFloorNote = (floor: SelectedFloorInfo) => floor.fullFloorTenant ? (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-violet-50 px-4 py-2.5 text-sm dark:bg-violet-500/10">
      <span className="text-violet-900 dark:text-violet-200">
        {t("adminObjects.spaces.wholeFloorRented")} <Link href={`/admin/tenants/${floor.fullFloorTenant.id}`} className="font-medium underline hover:no-underline">{floor.fullFloorTenant.companyName}</Link>
        {floor.fullFloorTenant.contractEnd && <>{t("adminObjects.spaces.wholeFloorUntil", { date: formatDateShortL(locale, floor.fullFloorTenant.contractEnd) })}</>}
      </span>
      {canAssignSpaces && <UnassignFloorButton floorId={floor.id} floorName={floor.name} tenantName={floor.fullFloorTenant.companyName} />}
    </div>
  ) : null
  const floorName = (name: string) =>
    /^-?\d+$/.test(name.trim()) ? t("adminObjects.floors.numberedName", { number: name.trim() }) : name
  const floorGroups: FloorGroup[] = [
    ...roomFloors.map((floor) => ({
      id: floor.id,
      name: floorName(floor.name),
      note: t("adminObjects.spaces.floorRateNote", { rate: money(floor.ratePerSqm) }),
      wholeFloor: wholeFloorNote(floor),
    })),
    ...zoneFloors.filter((f) => isZoneFloor(f.kind)).map((floor) => ({
      id: floor.id,
      name: floor.name,
      note: t("adminObjects.spaces.zoneNote"),
      wholeFloor: null,
      isZone: true,
    })),
  ]
  // Объекты на обычных этажах (автомат в холле) показываем плиткой на своём этаже
  const boardRows = [...roomRows, ...objectRows]

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Building2}
        title={t("adminObjects.spaces.title")}
        subtitle={`${building?.name} · ${building?.address}`}
        actions={canEditSpaces && <AddSpaceDialog floors={floorOptions} />}
      />

      <StatGrid cols={3}>
        <StatCard
          icon={DoorOpen}
          tone="emerald"
          label={t("adminObjects.spaces.statVacant")}
          value={vacantRows.length}
          sub={vacantRows.length > 0
            ? t("adminObjects.spaces.vacantSub", { area: fmtArea(locale, vacantArea), amount: money(idleLoss) })
            : t("adminObjects.spaces.allRented")}
        />
        <StatCard
          icon={DoorClosed}
          tone="blue"
          label={t("adminObjects.spaces.occupancyLabel")}
          value={`${occupancyByArea}%`}
          sub={t("adminObjects.spaces.occupancySub", { occupied: occupiedRows.length, total: roomRows.length })}
        />
        <StatCard icon={Wallet} tone="violet" label={t("adminObjects.spaces.incomeLabel")} value={money(income)} sub={t("adminObjects.spaces.incomeSub")} />
      </StatGrid>

      <SpacesBoard floors={floorGroups} rows={boardRows} />

      {/* Редкие и опасные действия — внизу, а не рядом с «Добавить» */}
      {building && (hasFloorEditor || (canDeleteSpaces && allSpaces.length > 0)) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 px-5 py-4 text-sm dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/admin/buildings/${building.id}/map`} className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline dark:text-blue-400">
              <MapIcon className="h-4 w-4" /> {t("adminObjects.buildings.mapLink")}
            </Link>
            {hasFloorEditor && (
              <Link href={`/admin/builder/${building.id}`} className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline dark:text-blue-400">
                <Box className="h-4 w-4" /> {t("adminObjects.buildings.modelLink")}
              </Link>
            )}
          </div>
          {canDeleteSpaces && allSpaces.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 dark:text-slate-500">{t("adminObjects.spaces.dangerZone")}</span>
              <WipeAllSpacesButton buildingId={building.id} buildingName={building.name} spacesCount={allSpaces.length} />
            </div>
          )}
        </div>
      )}
    </div>
  )
  })
}

async function getOverviewBuildings(
  orgId: string,
  accessibleBuildingIds: string[],
  safe: SafeQuery,
): Promise<OverviewBuilding[]> {
  const where = { id: { in: accessibleBuildingIds }, organizationId: orgId, isActive: true }
  const full = await safe(
    "admin.spaces.overviewBuildings.full",
    db.building.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        floors: {
          orderBy: { number: "asc" },
          select: {
            id: true,
            name: true,
            number: true,
            totalArea: true,
            ratePerSqm: true,
          },
        },
      },
    }) as unknown as Promise<OverviewBuilding[]>,
    null as OverviewBuilding[] | null,
  )
  if (full) return full

  return safe(
    "admin.spaces.overviewBuildings.legacy",
    db.building.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        floors: {
          orderBy: { number: "asc" },
          select: {
            id: true,
            name: true,
            number: true,
            ratePerSqm: true,
          },
        },
      },
    }).then((rows) => rows.map((building) => ({
      ...building,
      floors: building.floors.map((floor) => ({ ...floor, totalArea: null })),
    }))),
    [] as OverviewBuilding[],
  )
}

async function getSelectedBuilding(buildingId: string, safe: SafeQuery): Promise<SelectedBuildingInfo | null> {
  const full = await safe(
    "admin.spaces.selectedBuilding.full",
    db.building.findUnique({
      where: { id: buildingId },
      select: {
        id: true,
        name: true,
        address: true,
        totalArea: true,
        floors: {
          orderBy: { number: "asc" },
          select: {
            id: true,
            number: true,
            name: true,
            kind: true,
            ratePerSqm: true,
            totalArea: true,
            fullFloorTenant: {
              select: { id: true, companyName: true, contractEnd: true },
            },
            spaces: {
              orderBy: { number: "asc" },
              select: {
                id: true,
                number: true,
                area: true,
                status: true,
                kind: true,
                description: true,
                photos: true,
                tenant: {
                  select: {
                    id: true,
                    companyName: true,
                    contractEnd: true,
                    customRate: true,
                    fixedMonthlyRent: true,
                    fullFloors: { select: { fixedMonthlyRent: true } },
                    tenantSpaces: {
                      select: {
                        space: {
                          select: {
                            area: true,
                            floor: { select: { ratePerSqm: true } },
                          },
                        },
                      },
                    },
                  },
                },
                tenantSpaces: {
                  select: {
                    tenant: {
                      select: {
                        id: true,
                        companyName: true,
                        contractEnd: true,
                        customRate: true,
                        fixedMonthlyRent: true,
                        fullFloors: { select: { fixedMonthlyRent: true } },
                        tenantSpaces: {
                          select: {
                            space: {
                              select: {
                                area: true,
                                floor: { select: { ratePerSqm: true } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }) as unknown as Promise<SelectedBuildingInfo | null>,
    null,
  )
  if (full) return full

  return safe(
    "admin.spaces.selectedBuilding.legacy",
    db.building.findUnique({
      where: { id: buildingId },
      select: {
        id: true,
        name: true,
        address: true,
        floors: {
          orderBy: { number: "asc" },
          select: {
            id: true,
            number: true,
            name: true,
            kind: true,
            ratePerSqm: true,
            spaces: {
              orderBy: { number: "asc" },
              select: {
                id: true,
                number: true,
                area: true,
                status: true,
                description: true,
                photos: true,
                tenant: {
                  select: {
                    id: true,
                    companyName: true,
                    contractEnd: true,
                  },
                },
              },
            },
          },
        },
      },
    }).then((building) => building ? normalizeLegacySelectedBuilding(building) : null),
    null as SelectedBuildingInfo | null,
  )
}

function normalizeLegacySelectedBuilding(building: {
  id: string
  name: string
  address: string
  floors: Array<{
    id: string
    number: number
    name: string
    kind?: string
    ratePerSqm: number
    spaces: Array<{
      id: string
      number: string
      area: number
      status: string
      description: string | null
      tenant: { id: string; companyName: string; contractEnd: Date | null } | null
    }>
  }>
}): SelectedBuildingInfo {
  return {
    id: building.id,
    name: building.name,
    address: building.address,
    totalArea: null,
    floors: building.floors.map((floor) => ({
      id: floor.id,
      number: floor.number,
      name: floor.name,
      kind: floor.kind ?? "FLOOR",
      ratePerSqm: floor.ratePerSqm,
      totalArea: null,
      fullFloorTenant: null,
      spaces: floor.spaces.map((space) => ({
        id: space.id,
        number: space.number,
        area: space.area,
        status: space.status,
        kind: "RENTABLE",
        description: space.description,
        photos: (space as { photos?: string | null }).photos ?? null,
        tenant: space.tenant ? normalizeLegacyTenant(space.tenant, space.area, floor.ratePerSqm) : null,
        tenantSpaces: [],
      })),
    })),
  }
}

function normalizeLegacyTenant(
  tenant: { id: string; companyName: string; contractEnd: Date | null },
  area: number,
  ratePerSqm: number,
): SpaceTenantInfo {
  return {
    ...tenant,
    customRate: null,
    fixedMonthlyRent: null,
    fullFloors: [],
    tenantSpaces: [{ space: { area, floor: { ratePerSqm } } }],
  }
}

function fmtArea(locale: Locale, v: number): string {
  // Дробная часть только когда она есть: «30 м²», но «30,5 м²».
  return `${new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 1 }).format(v)} м²`
}
