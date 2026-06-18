import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { Layers, Building2, User } from "lucide-react"
import Link from "next/link"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg } from "@/lib/scope-guards"
import { formatMoney, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { FloorSettingsForm } from "./settings-form"
import { AddSpaceDialog } from "@/app/admin/spaces/space-actions"
import { AssignTenantButton } from "./assign-tenant-button"
import { tenantScope } from "@/lib/tenant-scope"
import { assertBuildingAccess } from "@/lib/building-access"
import { isZoneFloor, isObjectSpace } from "@/lib/zone-kinds"

export default async function FloorSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const { id } = await params
  try {
    await assertFloorInOrg(id, orgId)
  } catch {
    notFound()
  }

  const floor = await db.floor.findUnique({
    where: { id },
    include: {
      building: { select: { id: true, name: true, address: true } },
      fullFloorTenant: { select: { id: true, companyName: true, contractEnd: true } },
      spaces: {
        orderBy: { number: "asc" },
        include: {
          tenant: {
            select: {
              id: true,
              companyName: true,
              contractEnd: true,
            },
          },
          tenantSpaces: {
            select: {
              tenant: {
                select: {
                  id: true,
                  companyName: true,
                  contractEnd: true,
                },
              },
            },
            take: 1,
          },
        },
      },
    },
  })

  if (!floor) notFound()
  await assertBuildingAccess(floor.buildingId, orgId)

  const floorTenantIds = Array.from(new Set(
    floor.spaces
      .map((space) => space.tenantSpaces[0]?.tenant?.id ?? space.tenant?.id ?? null)
      .filter(Boolean) as string[],
  ))

  // Кандидаты для привязки: арендаторы этого здания и ещё не назначенные арендаторы организации.
  const tenantCandidates = await db.tenant.findMany({
    where: {
      AND: [
        tenantScope(orgId),
        {
          OR: [
            { space: { floor: { buildingId: floor.buildingId } } },
            { tenantSpaces: { some: { space: { floor: { buildingId: floor.buildingId } } } } },
            { fullFloors: { some: { buildingId: floor.buildingId } } },
            { spaceId: null, fullFloors: { none: {} }, user: { organizationId: orgId } },
          ],
        },
      ],
    },
    select: {
      id: true,
      companyName: true,
      space: {
        select: {
          number: true,
          floor: { select: { name: true } },
        },
      },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { space: { select: { number: true, floor: { select: { name: true } } } } },
      },
      fullFloors: { select: { id: true } },
    },
    orderBy: { companyName: "asc" },
  })
  const tenantDebtRows = floorTenantIds.length > 0
    ? await db.charge.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: floorTenantIds }, isPaid: false },
        _sum: { amount: true },
      })
    : []
  const debtByTenantId = new Map(tenantDebtRows.map((row) => [row.tenantId, row._sum.amount ?? 0]))
  const candidates = tenantCandidates
    .map((t) => ({
      id: t.id,
      companyName: t.companyName,
      currentSpace: t.tenantSpaces[0]?.space
        ? { number: t.tenantSpaces[0].space.number, floorName: t.tenantSpaces[0].space.floor.name }
        : t.space
          ? { number: t.space.number, floorName: t.space.floor.name }
        : null,
    }))

  // Стат: разделим RENTABLE и COMMON
  const rentable = floor.spaces.filter((s) => s.kind !== "COMMON")
  const common = floor.spaces.filter((s) => s.kind === "COMMON")
  const occupied = rentable.filter((s) => s.status === "OCCUPIED").length
  const vacant = rentable.filter((s) => s.status === "VACANT").length
  const totalArea = floor.spaces.reduce((s, sp) => s + sp.area, 0)
  const fullFloorTenant = floor.fullFloorTenant
  const isZone = isZoneFloor(floor.kind)
  const unitWord = isZone ? "Объекты" : "Помещения"

  return (
    <div className="space-y-5">
      {/* Full-floor banner */}
      {fullFloorTenant && (
        <div className="bg-violet-50 dark:bg-violet-500/5 border border-violet-200 dark:border-violet-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 font-bold">⚿</span>
            <div className="flex-1 text-sm">
              <p className="font-medium text-violet-900 dark:text-violet-200">
                Этаж сдан целиком: <Link href={`/admin/tenants/${fullFloorTenant.id}`} className="underline hover:no-underline">{fullFloorTenant.companyName}</Link>
                {fullFloorTenant.contractEnd && (
                  <span className="ml-2 text-violet-600 dark:text-violet-400 text-xs">
                    (договор до {new Date(fullFloorTenant.contractEnd).toLocaleDateString("ru-RU")})
                  </span>
                )}
              </p>
              <p className="text-violet-700 dark:text-violet-400 text-xs mt-0.5">
                Помещения этажа недоступны для индивидуальной сдачи.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Settings + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Настройки этажа</h2>
          </div>
          <FloorSettingsForm
            floorId={floor.id}
            initial={{
              name: floor.name,
              ratePerSqm: floor.ratePerSqm,
              totalArea: floor.totalArea,
            }}
          />
        </div>

        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Помещения</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{rentable.length}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Аренд.</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{occupied}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Занято</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{vacant}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Свободно</p>
              </div>
            </div>
            {common.length > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                + {common.length} общих зон ({common.reduce((s, x) => s + x.area, 0).toFixed(0)} м²)
              </p>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Σ Space.area: <b className="text-slate-700 dark:text-slate-300 tabular-nums">{totalArea.toFixed(1)} м²</b>
            </p>
          </div>
        </div>
      </div>

      {/* Spaces list */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {unitWord} ({floor.spaces.length})
            </h2>
          </div>
          <AddSpaceDialog
            floors={[{
              id: floor.id,
              number: floor.number,
              name: floor.name,
              totalArea: floor.totalArea,
              usedArea: totalArea,
              kind: floor.kind,
            }]}
            objectTenants={isZone ? candidates.map((c) => ({ id: c.id, companyName: c.companyName })) : []}
          />
        </div>
        {floor.spaces.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-2">{isZone ? "На зоне нет объектов" : "На этаже нет помещений"}</p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-5 py-2 text-left font-medium text-slate-500 dark:text-slate-400">{isZone ? "Объект" : "Кабинет"}</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Площадь</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Тип</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Статус</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Арендатор</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500 dark:text-slate-400">Долг</th>
              </tr>
            </thead>
            <tbody>
              {floor.spaces.map((sp) => {
                const tenant = sp.tenantSpaces[0]?.tenant ?? sp.tenant
                const debt = tenant ? debtByTenantId.get(tenant.id) ?? 0 : 0
                return (
                  <tr key={sp.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-100">{isObjectSpace(sp.kind) ? sp.number : `Каб. ${sp.number}`}</td>
                    <td className="px-5 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">{isObjectSpace(sp.kind) ? "—" : `${sp.area} м²`}</td>
                    <td className="px-5 py-2.5">
                      {sp.kind === "COMMON" ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Общая зона</span>
                      ) : isObjectSpace(sp.kind) ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300">Объект</span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">Аренд.</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", STATUS_COLORS[sp.status as keyof typeof STATUS_COLORS])}>
                        {STATUS_LABELS[sp.status as keyof typeof STATUS_LABELS] ?? sp.status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 dark:text-slate-400">
                      {tenant ? (
                        <Link href={`/admin/tenants/${tenant.id}`} className="hover:underline">{tenant.companyName}</Link>
                      ) : sp.kind === "COMMON" ? (
                        <span className="text-slate-400 dark:text-slate-600 text-[11px]">не сдаётся</span>
                      ) : fullFloorTenant ? (
                        <span className="text-slate-400 dark:text-slate-600 text-[11px]">этаж сдан</span>
                      ) : (
                        <AssignTenantButton
                          spaceId={sp.id}
                          spaceNumber={sp.number}
                          candidates={candidates}
                        />
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {debt > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">{formatMoney(debt)}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            Ставка: {formatMoney(floor.ratePerSqm)}/м²
          </span>
          <Link href="/admin/spaces" className="text-blue-600 dark:text-blue-400 hover:underline">
            Управление помещениями →
          </Link>
        </div>
      </div>
    </div>
  )
}
