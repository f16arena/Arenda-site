export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney, LEGAL_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils"
import { Search } from "lucide-react"
import Link from "next/link"
import { TenantDialog } from "./tenant-dialog"
import { DeleteTenantButton } from "./delete-tenant-button"
import { getCurrentBuildingId } from "@/lib/current-building"

export default async function TenantsPage() {
  const buildingId = await getCurrentBuildingId()
  const floorIds = buildingId
    ? (await db.floor.findMany({ where: { buildingId }, select: { id: true } })).map((f) => f.id)
    : []

  const tenants = await db.tenant.findMany({
    where: floorIds.length > 0 ? {
      space: { floorId: { in: floorIds } },
    } : undefined,
    select: {
      id: true,
      companyName: true,
      legalType: true,
      bin: true,
      category: true,
      createdAt: true,
      user: { select: { id: true, name: true, phone: true, email: true } },
      space: {
        select: {
          number: true,
          area: true,
          floor: { select: { name: true, ratePerSqm: true } },
        },
      },
      charges: { where: { isPaid: false }, select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const vacantSpaces = await db.space.findMany({
    where: { status: "VACANT", ...(floorIds.length > 0 ? { floorId: { in: floorIds } } : {}) },
    select: {
      id: true,
      number: true,
      area: true,
      floor: { select: { name: true } },
    },
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Арендаторы</h1>
          <p className="text-sm text-slate-500 mt-0.5">{tenants.length} зарегистрировано</p>
        </div>
        <TenantDialog vacantSpaces={vacantSpaces.map((s) => ({
          id: s.id,
          number: s.number,
          floorName: s.floor.name,
          area: s.area,
        }))} />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по названию..."
            className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white text-slate-700">
          <option value="">Все этажи</option>
          <option value="1">1 этаж</option>
          <option value="2">2 этаж</option>
          <option value="3">3 этаж</option>
          <option value="-1">Подвал</option>
        </select>
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white text-slate-700">
          <option value="">Все статусы</option>
          <option value="debt">С долгом</option>
          <option value="ok">Без долга</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Компания</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Тип</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Помещение</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Площадь</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Телефон</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Задолженность</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => {
              const debt = t.charges.reduce((s, c) => s + c.amount, 0)
              return (
                <tr
                  key={t.id}
                  className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900">{t.companyName}</p>
                    <p className="text-xs text-slate-400">{t.category ?? "Вид деятельности не указан"}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-slate-600">
                      {LEGAL_TYPE_LABELS[t.legalType] ?? t.legalType}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {t.space ? (
                      <span>
                        Каб. {t.space.number}
                        <span className="text-slate-400 ml-1">· {t.space.floor.name}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">Не назначено</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {t.space ? `${t.space.area} м²` : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {t.user.phone ?? t.user.email ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {debt > 0 ? (
                      <span className="font-medium text-red-600">{formatMoney(debt)}</span>
                    ) : (
                      <span className="text-emerald-600 text-xs">Нет долга</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/admin/tenants/${t.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Открыть
                      </Link>
                      <DeleteTenantButton tenantId={t.id} companyName={t.companyName} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                  Арендаторы не добавлены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
