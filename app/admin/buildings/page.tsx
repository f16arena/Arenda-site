export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getCurrentBuildingId } from "@/lib/current-building"
import { Building2, MapPin, Layers, Users, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { CreateBuildingButton, BuildingActions, FloorsList } from "./building-actions"
import { BuildingAdminAssign } from "./admin-assign"
import { requireOrgAccess } from "@/lib/org"
import { getAccessibleBuildingIdsForSession, isOwnerLike } from "@/lib/building-access"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { safeServerValue } from "@/lib/server-fallback"

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
    ratePerSqm: number
    _count: { spaces: number }
  }>
  _count: { floors: number }
}

export default async function BuildingsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
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

  // Считаем арендаторов и помещения по каждому зданию
  const stats = await Promise.all(
    buildings.map(async (b) => {
      const floorIds = b.floors.map((f) => f.id)
      const [tenantsCount, spacesCount, occupiedCount] = await Promise.all([
        safe(`admin.buildings.${b.id}.tenantsCount`, db.tenant.count({
          where: { space: { floorId: { in: floorIds } } },
        }), 0),
        safe(`admin.buildings.${b.id}.spacesCount`, db.space.count({ where: { floorId: { in: floorIds } } }), 0),
        safe(`admin.buildings.${b.id}.occupiedCount`, db.space.count({ where: { floorId: { in: floorIds }, status: "OCCUPIED" } }), 0),
      ])
      return { id: b.id, tenantsCount, spacesCount, occupiedCount }
    })
  )
  const statsById = new Map(stats.map((s) => [s.id, s]))

  const active = buildings.filter((b) => b.isActive)
  const inactive = buildings.filter((b) => !b.isActive)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
            <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Здания</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
              {active.length} активных
              {inactive.length > 0 && ` · ${inactive.length} неактивных`}
            </p>
          </div>
        </div>
        {canCreateBuildings && <CreateBuildingButton />}
      </div>

      {buildings.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-16 text-center">
          <Building2 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Нет зданий</p>
          {canCreateBuildings && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Нажмите «Добавить» чтобы создать первое</p>}
        </div>
      )}

      <div className="space-y-4">
        {[...active, ...inactive].map((b) => {
          const s = statsById.get(b.id) ?? { tenantsCount: 0, spacesCount: 0, occupiedCount: 0 }
          const isCurrent = b.id === currentBuildingId
          return (
            <div
              key={b.id}
              className={cn(
                "bg-white dark:bg-slate-900 rounded-xl border-2 overflow-hidden",
                isCurrent ? "border-blue-500" : "border-slate-200 dark:border-slate-800",
                !b.isActive && "opacity-60"
              )}
            >
              <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{b.name}</h2>
                    {isCurrent && (
                      <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
                        <Check className="h-3 w-3" />
                        Выбрано
                      </span>
                    )}
                    {!b.isActive && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium">
                        Неактивно
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {b.address}
                  </p>
                  {b.description && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{b.description}</p>
                  )}
                  {canEditBuildings && (
                    <div className="mt-2">
                      <BuildingAdminAssign
                        buildingId={b.id}
                        current={b.administrator}
                        candidates={adminCandidates}
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {b.responsible && (
                      <span>👤 {b.responsible}</span>
                    )}
                    {b.phone && (
                      <a href={`tel:${b.phone}`} className="hover:text-blue-600 dark:hover:text-blue-400">
                        📞 {b.phone}
                      </a>
                    )}
                    {b.email && (
                      <a href={`mailto:${b.email}`} className="hover:text-blue-600 dark:hover:text-blue-400">
                        ✉ {b.email}
                      </a>
                    )}
                    {b.totalArea && (
                      <span>📐 {b.totalArea} м²</span>
                    )}
                  </div>
                </div>
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

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
                <Stat label="Этажей" value={b._count.floors} icon={Layers} />
                <Stat label="Помещений" value={s.spacesCount} icon={Building2} />
                <Stat label="Занято" value={s.occupiedCount} accent="text-blue-600 dark:text-blue-400" />
                <Stat label="Свободно" value={s.spacesCount - s.occupiedCount} accent="text-emerald-600 dark:text-emerald-400" />
                <Stat label="Арендаторов" value={s.tenantsCount} icon={Users} />
              </div>

              {/* Площадь здания = Σ Floor.totalArea (рассчитывается автоматически) */}
              {(() => {
                const sumFloorArea = b.floors.reduce((acc, f) => acc + (f.totalArea ?? 0), 0)
                const allFloorsHaveArea = b.floors.length > 0 && b.floors.every((f) => f.totalArea && f.totalArea > 0)
                return (
                  <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        Общая площадь здания:{" "}
                        <b className="text-slate-900 dark:text-slate-100 tabular-nums">
                          {sumFloorArea > 0 ? `${sumFloorArea.toFixed(1)} м²` : "не задана"}
                        </b>{" "}
                        <span className="text-slate-400 dark:text-slate-500">
                          = Σ {b.floors.length} этаж{b.floors.length === 1 ? "а" : "ей"}
                        </span>
                      </span>
                    </div>
                    {!allFloorsHaveArea && b.floors.length > 0 && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                        Не у всех этажей задана площадь — кликните этаж чтобы её заполнить.
                      </p>
                    )}
                  </div>
                )
              })()}

              <FloorsList
                buildingId={b.id}
                floors={b.floors.map((f) => ({
                  id: f.id,
                  number: f.number,
                  name: f.name,
                  ratePerSqm: f.ratePerSqm,
                  totalArea: f.totalArea,
                  spacesCount: f._count.spaces,
                }))}
                canCreate={canCreateFloors}
                canDelete={canDeleteFloors}
              />
            </div>
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
  label, value, icon: Icon, accent,
}: {
  label: string
  value: number
  icon?: React.ElementType
  accent?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-0.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <p className={cn("text-xl font-bold", accent ?? "text-slate-900 dark:text-slate-100")}>{value}</p>
    </div>
  )
}
