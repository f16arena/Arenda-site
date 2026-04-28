import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import {
  updateTenant,
  updateTenantUser,
  updateTenantRequisites,
  updateTenantRentalTerms,
  assignTenantSpace,
} from "@/app/actions/tenant"
import { formatMoney, formatDate, LEGAL_TYPE_LABELS, CHARGE_TYPES } from "@/lib/utils"
import { ArrowLeft, Building2, User, CreditCard, FileText, Receipt } from "lucide-react"
import Link from "next/link"
import { DeleteTenantButton } from "../delete-tenant-button"
import { DocumentsChecklist } from "./documents-checklist"
import { FullFloorAssign } from "./full-floor-assign"

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const { id } = await params

  const tenant = await db.tenant.findUnique({
    where: { id },
    include: {
      user: true,
      space: { include: { floor: true } },
      charges: { orderBy: { createdAt: "desc" }, take: 20 },
      payments: { orderBy: { paymentDate: "desc" }, take: 10 },
      contracts: { orderBy: { createdAt: "desc" }, take: 5 },
      requests: { orderBy: { createdAt: "desc" }, take: 5 },
      documents: { orderBy: { createdAt: "desc" } },
    },
  })

  if (!tenant) notFound()

  const totalDebt = tenant.charges
    .filter((c) => !c.isPaid)
    .reduce((s, c) => s + c.amount, 0)

  const vacantSpaces = await db.space.findMany({
    where: { status: "VACANT" },
    include: { floor: true },
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  })

  const allFloors = await db.floor.findMany({
    select: { id: true, name: true, totalArea: true, ratePerSqm: true, fullFloorTenantId: true, fixedMonthlyRent: true },
    orderBy: { number: "asc" },
  })

  const myFullFloors = allFloors
    .filter((f) => f.fullFloorTenantId === tenant.id)
    .map((f) => ({ id: f.id, name: f.name, fixedMonthlyRent: f.fixedMonthlyRent }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/tenants"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">{tenant.companyName}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {LEGAL_TYPE_LABELS[tenant.legalType] ?? tenant.legalType}
            {tenant.category ? ` · ${tenant.category}` : ""}
          </p>
        </div>
        <div className="text-right">
          {totalDebt > 0 ? (
            <p className="text-lg font-bold text-red-600">{formatMoney(totalDebt)}</p>
          ) : (
            <p className="text-sm font-medium text-emerald-600">Задолженности нет</p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">Текущий долг</p>
        </div>
        <DeleteTenantButton
          tenantId={tenant.id}
          companyName={tenant.companyName}
          redirectAfter
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column: forms */}
        <div className="col-span-2 space-y-5">
          {/* Contact info */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <User className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">Контактное лицо</h2>
            </div>
            <form
              action={async (formData: FormData) => {
                "use server"
                await updateTenantUser(tenant.userId, tenant.id, formData)
              }}
              className="p-5 grid grid-cols-2 gap-4"
            >
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">ФИО</label>
                <input
                  name="name"
                  defaultValue={tenant.user.name}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Телефон</label>
                <input
                  name="phone"
                  defaultValue={tenant.user.phone ?? ""}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Email</label>
                <input
                  name="email"
                  type="email"
                  defaultValue={tenant.user.email ?? ""}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>

          {/* Company info */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <Building2 className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">Данные компании</h2>
            </div>
            <form
              action={async (formData: FormData) => {
                "use server"
                await updateTenant(tenant.id, formData)
              }}
              className="p-5 grid grid-cols-2 gap-4"
            >
              <input type="hidden" name="bankName" value={tenant.bankName ?? ""} />
              <input type="hidden" name="iik" value={tenant.iik ?? ""} />
              <input type="hidden" name="bik" value={tenant.bik ?? ""} />
              <input type="hidden" name="cleaningFee" value={tenant.cleaningFee} />
              <input type="hidden" name="needsCleaning" value={tenant.needsCleaning ? "on" : ""} />
              <input type="hidden" name="customRate" value={tenant.customRate ?? ""} />

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Название компании</label>
                <input
                  name="companyName"
                  defaultValue={tenant.companyName}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Правовая форма</label>
                <select
                  name="legalType"
                  defaultValue={tenant.legalType}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white"
                >
                  <option value="IP">ИП</option>
                  <option value="TOO">ТОО</option>
                  <option value="AO">АО</option>
                  <option value="PHYSICAL">Физ. лицо</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">БИН (для ТОО/АО)</label>
                <input
                  name="bin"
                  defaultValue={tenant.bin ?? ""}
                  placeholder="12 цифр"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">ИИН (для ИП/физлица)</label>
                <input
                  name="iin"
                  defaultValue={tenant.iin ?? ""}
                  placeholder="12 цифр"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Вид деятельности</label>
                <input
                  name="category"
                  defaultValue={tenant.category ?? ""}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Юридический адрес</label>
                <input
                  name="legalAddress"
                  defaultValue={tenant.legalAddress ?? ""}
                  placeholder="г. Усть-Каменогорск, ул..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Фактический адрес</label>
                <input
                  name="actualAddress"
                  defaultValue={tenant.actualAddress ?? ""}
                  placeholder="Если совпадает с юридическим — оставьте пустым"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">ФИО руководителя</label>
                <input
                  name="directorName"
                  defaultValue={tenant.directorName ?? ""}
                  placeholder="Иванов Иван Иванович"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Должность руководителя</label>
                <input
                  name="directorPosition"
                  defaultValue={tenant.directorPosition ?? ""}
                  placeholder="Директор / Учредитель"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Начало договора</label>
                <input
                  name="contractStart"
                  type="date"
                  defaultValue={tenant.contractStart?.toISOString().slice(0, 10) ?? ""}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Конец договора</label>
                <input
                  name="contractEnd"
                  type="date"
                  defaultValue={tenant.contractEnd?.toISOString().slice(0, 10) ?? ""}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>

          {/* Requisites */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <CreditCard className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">Банковские реквизиты</h2>
            </div>
            <form
              action={async (formData: FormData) => {
                "use server"
                await updateTenantRequisites(tenant.id, formData)
              }}
              className="p-5 grid grid-cols-2 gap-4"
            >
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Название банка</label>
                <input
                  name="bankName"
                  defaultValue={tenant.bankName ?? ""}
                  placeholder="Kaspi Bank / Halyk / и т.д."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">ИИК (расчётный счёт)</label>
                <input
                  name="iik"
                  defaultValue={tenant.iik ?? ""}
                  placeholder="KZxxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">БИК банка</label>
                <input
                  name="bik"
                  defaultValue={tenant.bik ?? ""}
                  placeholder="CASPKZKA"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">БИН / ИИН</label>
                <input
                  name="bin"
                  defaultValue={tenant.bin ?? ""}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Сохранить реквизиты
                </button>
              </div>
            </form>
          </div>

          {/* Rental terms */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <Receipt className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">Условия аренды</h2>
            </div>
            <form
              action={async (formData: FormData) => {
                "use server"
                await updateTenantRentalTerms(tenant.id, formData)
              }}
              className="p-5 grid grid-cols-3 gap-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Индивид. ставка ₸/м²</label>
                <input
                  name="customRate"
                  type="number"
                  step="0.01"
                  defaultValue={tenant.customRate ?? ""}
                  placeholder="Если отличается от этажной"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Уборка ₸/мес</label>
                <input
                  name="cleaningFee"
                  type="number"
                  step="0.01"
                  defaultValue={tenant.cleaningFee}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    name="needsCleaning"
                    type="checkbox"
                    defaultChecked={tenant.needsCleaning}
                    className="rounded border-slate-300"
                  />
                  Требуется уборка
                </label>
              </div>
              <div className="col-span-3 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>

          {/* Documents checklist */}
          <DocumentsChecklist
            tenantId={tenant.id}
            legalType={tenant.legalType}
            documents={tenant.documents}
          />
        </div>

        {/* Right column: info cards */}
        <div className="space-y-5">
          {/* Full floor assign */}
          <FullFloorAssign
            tenantId={tenant.id}
            floors={allFloors}
            currentFloors={myFullFloors}
          />

          {/* Space */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-400 mb-2">ПОМЕЩЕНИЕ</p>
            {tenant.space ? (
              <div>
                <p className="text-2xl font-bold text-slate-900">Каб. {tenant.space.number}</p>
                <p className="text-sm text-slate-500 mt-0.5">{tenant.space.floor.name}</p>
                <p className="text-sm text-slate-600 mt-2">{tenant.space.area} м²</p>
                {tenant.customRate ? (
                  <p className="text-xs text-blue-600 mt-1">Инд. ставка: {formatMoney(tenant.customRate)}/м²</p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">
                    Ставка этажа: {formatMoney(tenant.space.floor.ratePerSqm)}/м²
                  </p>
                )}
                <p className="text-xs font-semibold text-slate-900 mt-2">
                  Аренда: {formatMoney(
                    tenant.space.area * (tenant.customRate ?? tenant.space.floor.ratePerSqm)
                  )}/мес
                </p>
                <Link
                  href={`/admin/documents/templates/rental?tenantId=${tenant.id}`}
                  className="mt-3 block text-center rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Сформировать договор
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-400 mb-3">Помещение не назначено</p>
                <p className="text-xs text-slate-500 mb-2 font-medium">Свободные помещения:</p>
                <div className="space-y-2">
                  {vacantSpaces.map((s) => (
                    <form
                      key={s.id}
                      action={async () => {
                        "use server"
                        await assignTenantSpace(tenant.id, s.id)
                      }}
                    >
                      <button
                        type="submit"
                        className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <span className="font-medium">Каб. {s.number}</span>
                        <span className="text-slate-400 ml-1">· {s.floor.name} · {s.area} м²</span>
                      </button>
                    </form>
                  ))}
                  {vacantSpaces.length === 0 && (
                    <p className="text-xs text-slate-400">Нет свободных помещений</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Contracts */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
              <FileText className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold text-slate-700">Договоры</p>
            </div>
            <div className="divide-y divide-slate-50">
              {tenant.contracts.map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">№ {c.number}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-slate-400">
                      {c.startDate ? formatDate(c.startDate) : "—"} →{" "}
                      {c.endDate ? formatDate(c.endDate) : "—"}
                    </p>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        c.status === "SIGNED"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {c.status === "SIGNED" ? "Подписан" : "Черновик"}
                    </span>
                  </div>
                </div>
              ))}
              {tenant.contracts.length === 0 && (
                <p className="px-4 py-4 text-xs text-slate-400 text-center">Нет договоров</p>
              )}
            </div>
          </div>

          {/* Recent charges */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-700">Последние начисления</p>
            </div>
            <div className="divide-y divide-slate-50">
              {tenant.charges.slice(0, 6).map((c) => (
                <div key={c.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-700">
                      {CHARGE_TYPES[c.type] ?? c.type}
                    </p>
                    <p className="text-[10px] text-slate-400">{c.period}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${c.isPaid ? "text-emerald-600" : "text-red-600"}`}>
                      {formatMoney(c.amount)}
                    </p>
                    <p className="text-[10px] text-slate-400">{c.isPaid ? "Оплачено" : "Долг"}</p>
                  </div>
                </div>
              ))}
              {tenant.charges.length === 0 && (
                <p className="px-4 py-4 text-xs text-slate-400 text-center">Начислений нет</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
