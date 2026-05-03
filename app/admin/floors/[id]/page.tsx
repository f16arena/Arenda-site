import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Layers, Building2, User, Sparkles } from "lucide-react"
import Link from "next/link"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg } from "@/lib/scope-guards"
import { hasFeature } from "@/lib/plan-features"
import { formatMoney, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { FloorSettingsForm } from "./settings-form"
import { AddSpaceDialog } from "@/app/admin/spaces/space-actions"
import { AssignTenantButton } from "./assign-tenant-button"
import { tenantScope } from "@/lib/tenant-scope"
import { assertBuildingAccess } from "@/lib/building-access"

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
              charges: { where: { isPaid: false }, select: { amount: true } },
            },
          },
        },
      },
    },
  })

  if (!floor) notFound()
  await assertBuildingAccess(floor.buildingId, orgId)

  const hasFloorEditor = await hasFeature(orgId, "floorEditor")

  // Кандидаты для привязки: арендаторы этого здания и ещё не назначенные арендаторы организации.
  const tenantCandidates = await db.tenant.findMany({
    where: {
      AND: [
        tenantScope(orgId),
        {
          OR: [
            { space: { floor: { buildingId: floor.buildingId } } },
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
      fullFloors: { select: { id: true } },
    },
    orderBy: { companyName: "asc" },
  })
  const candidates = tenantCandidates
    .filter((t) => t.fullFloors.length === 0) // не предлагаем тех кто сдан целиком
    .map((t) => ({
      id: t.id,
      companyName: t.companyName,
      currentSpace: t.space
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/buildings" className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100">
          <ArrowLeft className="h-4 w-4" />К зданиям
        </Link>
        <span className="text-slate-300">/</span>
        <Link href={`/admin/buildings`} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100">
          {floor.building.name}
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {floor.name}
        </h1>
      </div>

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

          {/* Visualization BETA card */}
          {hasFloorEditor ? (
            <Link
              href={`/admin/floors/${floor.id}/visualization`}
              className="block bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-500/10 dark:to-indigo-500/10 rounded-xl border border-purple-200 dark:border-purple-500/30 p-4 hover:from-purple-100 hover:to-indigo-100 transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">Визуализация</p>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-600 text-white">BETA</span>
                  </div>
                  <p className="text-[11px] text-purple-700 dark:text-purple-300">
                    PDF плана + AI распознавание помещений
                  </p>
                </div>
              </div>
            </Link>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-5 w-5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Визуализация (BETA)</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Доступно на тарифе «Бизнес» — <Link href="/admin/subscription" className="underline hover:no-underline">тарифы</Link>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Spaces list */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Помещения ({floor.spaces.length})
            </h2>
          </div>
          <AddSpaceDialog floors={[{
            id: floor.id,
            number: floor.number,
            name: floor.name,
            totalArea: floor.totalArea,
            usedArea: totalArea,
          }]} />
        </div>
        {floor.spaces.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-2">На этаже нет помещений</p>
            <Link href="/admin/spaces" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Добавить помещение →
            </Link>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-5 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Кабинет</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Площадь</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Тип</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Статус</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Арендатор</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500 dark:text-slate-400">Долг</th>
              </tr>
            </thead>
            <tbody>
              {floor.spaces.map((sp) => {
                const debt = sp.tenant?.charges.reduce((s, c) => s + c.amount, 0) ?? 0
                return (
                  <tr key={sp.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-100">Каб. {sp.number}</td>
                    <td className="px-5 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">{sp.area} м²</td>
                    <td className="px-5 py-2.5">
                      {sp.kind === "COMMON" ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Общая зона</span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">Аренд.</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", STATUS_COLORS[sp.status as keyof typeof STATUS_COLORS])}>
                        {STATUS_LABELS[sp.status as keyof typeof STATUS_LABELS]}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 dark:text-slate-400">
                      {sp.tenant ? (
                        <Link href={`/admin/tenants/${sp.tenant.id}`} className="hover:underline">{sp.tenant.companyName}</Link>
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
