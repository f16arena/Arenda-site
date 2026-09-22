export const dynamic = "force-dynamic"

import { getOccupancy } from "@/lib/data/occupancy"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getCurrentBuildingId } from "@/lib/current-building"
import Link from "next/link"
import { Building2, MapPin, Layers, Users, Check, Box, DoorClosed, DoorOpen, Map as MapIcon, User, Phone, Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatMoneyL } from "@/lib/i18n/format"
import { isZoneFloor } from "@/lib/zone-kinds"
import { CreateBuildingButton, BuildingActions, FloorsList } from "./building-actions"
import { BuildingAdminAssign } from "./admin-assign"
import { requireOrgAccess } from "@/lib/org"
import { getAccessibleBuildingIdsForSession, isOwnerLike } from "@/lib/building-access"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { safeServerValue } from "@/lib/server-fallback"
import { PageHeader } from "@/components/ui/page"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TONE_CHIP, TONE_TEXT, type Tone } from "@/lib/ui-tones"

type BuildingListItem = {
  id: string
  name: string
  address: string
  addressCountryCode: string | null
  addressRegion: string | null
  addressCity: string | null
  addressSettlement: string | null
  addressStreet: string | null
  addressHouseNumber: string | null
  addressPostcode: string | null
  addressLatitude: number | null
  addressLongitude: number | null
  addressSource: string | null
  addressSourceId: string | null
  description: string | null
  phone: string | null
  email: string | null
  responsible: string | null
  totalArea: number | null
  isActive: boolean
  administratorUserId: string | null
  administrator: { id: string; name: string; email: string | null; phone: string | null } | null
  floors: Array<{
    id: string
    number: number
    name: string
    kind: string
    ratePerSqm: number
    totalArea: number | null
    _count: { spaces: number }
  }>
  _count: { floors: number }
}

type LegacyBuildingListItem = {
  id: string
  name: string
  address: string
  description: string | null
  phone: string | null
  email: string | null
  responsible: string | null
  isActive: boolean
  floors: Array<{
    id: string
    number: number
    name: string
    kind: string
    ratePerSqm: number
    _count: { spaces: number }
  }>
  _count: { floors: number }
}

export default async function BuildingsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const locale = await getLocale()
  const { t, tp } = await getT(locale)
  const money = (amount: number) => formatMoneyL(locale, amount)
  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/buildings", orgId, userId: session.user.id })
  const isOwner = isOwnerLike(session.user.role, session.user.isPlatformOwner)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const allowedCapabilities = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
    orgId,
  }))
  const canCreateBuildings = allowedCapabilities.has("buildings.create")
  const canEditBuildings = allowedCapabilities.has("buildings.edit")
  const canToggleBuildings = allowedCapabilities.has("buildings.toggle")
  const canDeleteBuildings = allowedCapabilities.has("buildings.delete")
  const canCreateFloors = allowedCapabilities.has("floors.create")
  const canDeleteFloors = allowedCapabilities.has("floors.delete")

  const currentBuildingId = await getCurrentBuildingId()

  const buildingWhere = {
    organizationId: orgId,
    ...(isOwner ? {} : { id: { in: accessibleBuildingIds }, isActive: true }),
  }

  const fullBuildings = await safe(
    "admin.buildings.items.full",
    db.building.findMany({
      where: buildingWhere,
      select: {
        id: true,
        name: true,
        address: true,
        addressCountryCode: true,
        addressRegion: true,
        addressCity: true,
        addressSettlement: true,
        addressStreet: true,
        addressHouseNumber: true,
        addressPostcode: true,
        addressLatitude: true,
        addressLongitude: true,
        addressSource: true,
        addressSourceId: true,
        description: true,
        phone: true,
        email: true,
        responsible: true,
        totalArea: true,
        isActive: true,
        administratorUserId: true,
        administrator: { select: { id: true, name: true, email: true, phone: true } },
        floors: {
          select: {
            id: true,
            number: true,
            name: true,
            kind: true,
            ratePerSqm: true,
            totalArea: true,
            _count: { select: { spaces: true } },
          },
          orderBy: { number: "asc" },
        },
        _count: { select: { floors: true } },
      },
      orderBy: { createdAt: "asc" },
    }) as unknown as Promise<BuildingListItem[]>,
    null as BuildingListItem[] | null,
  )

  const legacyBuildings = await safe(
    "admin.buildings.items.legacy",
    db.building.findMany({
    where: {
      organizationId: orgId,
      ...(isOwner ? {} : { id: { in: accessibleBuildingIds }, isActive: true }),
    },
    select: {
      id: true,
      name: true,
      address: true,
      description: true,
      phone: true,
      email: true,
      responsible: true,
      isActive: true,
      floors: {
        select: {
          id: true,
          number: true,
          name: true,
          kind: true,
          ratePerSqm: true,
          _count: { select: { spaces: true } },
        },
        orderBy: { number: "asc" },
      },
      _count: { select: { floors: true } },
    },
    orderBy: { createdAt: "asc" },
    }).then((rows) => rows.map(normalizeLegacyBuilding)),
    [] as BuildingListItem[],
  )
  const buildings: BuildingListItem[] = fullBuildings ?? legacyBuildings

  // contractPrefix отдельным запросом — может не быть в БД до миграции 007
  const withPrefix = await safe(
    "admin.buildings.contractPrefixes",
    db.building.findMany({
      where: { id: { in: buildings.map((b) => b.id) } },
      select: { id: true, contractPrefix: true },
    }),
    [] as Array<{ id: string; contractPrefix: string | null }>,
  )
  const prefixMap = new Map(withPrefix.map((b) => [b.id, b.contractPrefix]))

  const feeRows = await safe(
    "admin.buildings.serviceFee",
    db.building.findMany({
      where: { id: { in: buildings.map((b) => b.id) } },
      select: { id: true, serviceFeeSummerRate: true, serviceFeeWinterRate: true },
    }),
    [] as Array<{ id: string; serviceFeeSummerRate: number | null; serviceFeeWinterRate: number | null }>,
  )
  const feeById = new Map(feeRows.map((r) => [r.id, { summer: r.serviceFeeSummerRate, winter: r.serviceFeeWinterRate }]))

  // Кандидаты в администраторы здания: ADMIN и OWNER из этой организации
  const adminCandidates = await safe(
    "admin.buildings.adminCandidates",
    db.user.findMany({
      where: { organizationId: orgId, isActive: true, role: { in: ["ADMIN", "OWNER"] } },
      select: { id: true, name: true, email: true, phone: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    [] as Array<{ id: string; name: string; email: string | null; phone: string | null; role: string }>,
  )

  // Помещения и арендаторы по всем зданиям сразу — 2 запроса вместо 3N.
  // Помещения — только настоящие (кабинеты, залы); места-объекты на крыше и
  // территории (антенна, киоск) считаются отдельно. Арендатор привязан к зданию
  // любым из четырёх путей: основное помещение, несколько помещений, этаж
  // целиком, здание напрямую (место без помещения).
  const buildingIds = buildings.map((b) => b.id)
  type TenantRow = {
    id: string
    buildingId: string | null
    space: { floor: { buildingId: string } } | null
    tenantSpaces: { space: { floor: { buildingId: string } } }[]
    fullFloors: { buildingId: string }[]
  }
  const inBuildings = { in: buildingIds }
  const [occupancy, allTenants] = await Promise.all([
    // Заполняемость — общая формула (lib/data/occupancy), как на обзоре и в аналитике.
    safe("admin.buildings.occupancy", getOccupancy(buildingIds), null),
    safe(
      "admin.buildings.tenantsAggregate",
      buildingIds.length > 0
        ? db.tenant.findMany({
            where: {
              user: { organizationId: orgId },
              deletedAt: null,
              OR: [
                { space: { floor: { buildingId: inBuildings } } },
                { tenantSpaces: { some: { space: { floor: { buildingId: inBuildings } } } } },
                { fullFloors: { some: { buildingId: inBuildings } } },
                { buildingId: inBuildings },
              ],
            },
            select: {
              id: true,
              buildingId: true,
              space: { select: { floor: { select: { buildingId: true } } } },
              tenantSpaces: { select: { space: { select: { floor: { select: { buildingId: true } } } } } },
              fullFloors: { select: { buildingId: true } },
            },
          })
        : Promise.resolve([] as TenantRow[]),
      [] as TenantRow[],
    ),
  ])

  const statsById = new Map(buildingIds.map((id) => [id, { tenantsCount: 0, spacesCount: 0, occupiedCount: 0, objectsCount: 0 }]))
  for (const [id, o] of occupancy?.byBuilding ?? []) {
    const cur = statsById.get(id)
    if (!cur) continue
    cur.spacesCount = o.rentableCount
    cur.occupiedCount = o.occupiedCount
    cur.objectsCount = o.objects.total
  }
  for (const t of allTenants) {
    const ids = new Set<string>([
      ...(t.space ? [t.space.floor.buildingId] : []),
      ...t.tenantSpaces.map((x) => x.space.floor.buildingId),
      ...t.fullFloors.map((f) => f.buildingId),
      ...(t.buildingId ? [t.buildingId] : []),
    ])
    for (const id of ids) {
      const cur = statsById.get(id)
      if (cur) cur.tenantsCount += 1
    }
  }

  const active = buildings.filter((b) => b.isActive)
  const inactive = buildings.filter((b) => !b.isActive)

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Building2}
        title={t("adminObjects.buildings.title")}
        subtitle={
          t("adminObjects.buildings.activeCount", { count: active.length })
          + (inactive.length > 0 ? ` · ${t("adminObjects.buildings.inactiveCount", { count: inactive.length })}` : "")
        }
        actions={canCreateBuildings && <CreateBuildingButton />}
      />

      {buildings.length === 0 && (
        <Card className="block py-16 text-center">
          <Building2 className="h-10 w-10 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("adminObjects.buildings.empty")}</p>
          {canCreateBuildings && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("adminObjects.buildings.emptyHint")}</p>}
        </Card>
      )}

      <div className="space-y-4">
        {[...active, ...inactive].map((b) => {
          const s = statsById.get(b.id) ?? { tenantsCount: 0, spacesCount: 0, occupiedCount: 0, objectsCount: 0 }
          const isCurrent = b.id === currentBuildingId
          return (
            <Card
              key={b.id}
              className={cn(
                "block p-0 rounded-2xl ring-0 border-2",
                isCurrent ? "border-blue-500" : "border-slate-200 dark:border-slate-800",
                !b.isActive && "opacity-60"
              )}
            >
              <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{b.name}</h2>
                    {isCurrent && (
                      <Badge className="bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
                        <Check className="h-3 w-3" />
                        {t("adminObjects.buildings.current")}
                      </Badge>
                    )}
                    {!b.isActive && (
                      <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {t("adminObjects.buildings.inactive")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {b.address}
                  </p>
                  {b.description && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{b.description}</p>
                  )}
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr]">
                    {canEditBuildings && (
                      <>
                        <dt className="self-center text-slate-400 dark:text-slate-500" title={t("adminObjects.buildings.adminHint")}>{t("adminObjects.buildings.adminLabel")}</dt>
                        <dd>
                          <BuildingAdminAssign buildingId={b.id} current={b.administrator} candidates={adminCandidates} />
                        </dd>
                      </>
                    )}
                    {(b.responsible || b.phone || b.email) && (
                      <>
                        <dt className="text-slate-400 dark:text-slate-500" title={t("adminObjects.buildings.contactHint")}>{t("adminObjects.buildings.contactLabel")}</dt>
                        <dd className="flex flex-wrap gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
                          {b.responsible && <span className="inline-flex items-center gap-1"><User className="h-3 w-3 text-slate-400" />{b.responsible}</span>}
                          {b.phone && (
                            <a href={`tel:${b.phone}`} className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400">
                              <Phone className="h-3 w-3 text-slate-400" />{b.phone}
                            </a>
                          )}
                          {b.email && (
                            <a href={`mailto:${b.email}`} className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400">
                              <Mail className="h-3 w-3 text-slate-400" />{b.email}
                            </a>
                          )}
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/buildings/${b.id}/map`}
                    title={t("adminObjects.buildings.mapHint")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    {t("adminObjects.buildings.mapLink")}
                  </Link>
                  <Link
                    href={`/admin/builder/${b.id}`}
                    title={t("adminObjects.buildings.modelHint")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:hover:bg-purple-500/20"
                  >
                    <Box className="h-3.5 w-3.5" />
                    {t("adminObjects.buildings.modelLink")}
                  </Link>
                <BuildingActions
                  buildingId={b.id}
                  isCurrent={isCurrent}
                  isActive={b.isActive}
                  canEdit={canEditBuildings}
                  canToggle={canToggleBuildings}
                  canDelete={canDeleteBuildings}
                  building={{
                    name: b.name,
                    address: b.address,
                    addressCountryCode: b.addressCountryCode,
                    addressRegion: b.addressRegion,
                    addressCity: b.addressCity,
                    addressSettlement: b.addressSettlement,
                    addressStreet: b.addressStreet,
                    addressHouseNumber: b.addressHouseNumber,
                    addressPostcode: b.addressPostcode,
                    addressLatitude: b.addressLatitude,
                    addressLongitude: b.addressLongitude,
                    addressSource: b.addressSource,
                    addressSourceId: b.addressSourceId,
                    description: b.description,
                    phone: b.phone,
                    email: b.email,
                    responsible: b.responsible,
                    totalArea: b.totalArea,
                    contractPrefix: prefixMap.get(b.id) ?? null,
                  }}
                />
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 p-5 border-b border-slate-100 dark:border-slate-800">
                <Stat label={t("adminObjects.buildings.stats.spaces")} value={s.spacesCount} icon={Building2} tone="blue" />
                <Stat label={t("adminObjects.buildings.stats.occupied")} value={s.occupiedCount} icon={DoorClosed} tone="violet" />
                <Stat label={t("adminObjects.buildings.stats.vacant")} value={s.spacesCount - s.occupiedCount} icon={DoorOpen} tone="emerald" />
                <Stat label={t("adminObjects.buildings.stats.zoneObjects")} value={s.objectsCount} icon={Layers} tone="slate" />
                <Stat label={t("adminObjects.buildings.stats.tenants")} value={s.tenantsCount} icon={Users} tone="teal" />
              </div>

              {/* Площадь (сумма обычных этажей) и эксплуатационный сбор — одной строкой */}
              {(() => {
                const buildingFloors = b.floors.filter((f) => !isZoneFloor(f.kind))
                const sumFloorArea = buildingFloors.reduce((acc, f) => acc + (f.totalArea ?? 0), 0)
                const missingArea = buildingFloors.filter((f) => !f.totalArea || f.totalArea <= 0).length
                const fee = feeById.get(b.id)
                const feeText = fee && (fee.summer || fee.winter)
                  ? fee.summer === fee.winter || !fee.winter
                    ? t("adminObjects.buildings.fee.flat", { amount: money(fee.summer ?? 0) })
                    : t("adminObjects.buildings.fee.seasonal", { summer: money(fee.summer ?? 0), winter: money(fee.winter) })
                  : t("adminObjects.buildings.fee.notSet")
                return (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-slate-100 bg-slate-50/40 px-5 py-3 text-xs dark:border-slate-800 dark:bg-slate-800/20">
                    <span className="text-slate-500 dark:text-slate-400">
                      {t("adminObjects.buildings.area.label")}{" "}
                      <b className="tabular-nums text-slate-900 dark:text-slate-100">{sumFloorArea > 0 ? `${sumFloorArea.toFixed(1)} м²` : t("adminObjects.buildings.area.notSet")}</b>
                      {missingArea > 0 && <span className="text-amber-600 dark:text-amber-400">{tp("adminObjects.buildings.area.missing", missingArea)}</span>}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t("adminObjects.buildings.fee.label")} <b className="text-slate-900 dark:text-slate-100">{feeText}</b>
                      {canEditBuildings && (
                        <Link href={`/admin/buildings/${b.id}/service-fee`} className="ml-2 font-medium text-blue-600 hover:underline dark:text-blue-400">
                          {t("adminObjects.buildings.fee.change")}
                        </Link>
                      )}
                    </span>
                  </div>
                )
              })()}

              <FloorsList
                buildingId={b.id}
                floors={b.floors.map((f) => ({
                  id: f.id,
                  number: f.number,
                  name: f.name,
                  kind: f.kind,
                  ratePerSqm: f.ratePerSqm,
                  totalArea: f.totalArea,
                  spacesCount: f._count.spaces,
                }))}
                canCreate={canCreateFloors}
                canDelete={canDeleteFloors}
              />
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function normalizeLegacyBuilding(building: LegacyBuildingListItem): BuildingListItem {
  return {
    ...building,
    addressCountryCode: null,
    addressRegion: null,
    addressCity: null,
    addressSettlement: null,
    addressStreet: null,
    addressHouseNumber: null,
    addressPostcode: null,
    addressLatitude: null,
    addressLongitude: null,
    addressSource: null,
    addressSourceId: null,
    totalArea: null,
    administratorUserId: null,
    administrator: null,
    floors: building.floors.map((floor) => ({ ...floor, totalArea: null })),
  }
}

function Stat({
  label, value, icon: Icon, tone = "slate",
}: {
  label: string
  value: number
  icon?: React.ElementType
  tone?: Tone
}) {
  return (
    <div className="flex items-center gap-2.5">
      {Icon && (
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONE_CHIP[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0">
        <p className={cn("text-lg font-bold leading-tight tabular-nums", TONE_TEXT[tone])}>{value}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  )
}
