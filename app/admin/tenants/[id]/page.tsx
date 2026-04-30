import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg } from "@/lib/scope-guards"
import {
  updateTenant,
  updateTenantUser,
  updateTenantRequisites,
  updateTenantRentalTerms,
  assignTenantSpace,
} from "@/app/actions/tenant"
import { formatMoney, formatDate, LEGAL_TYPE_LABELS, CHARGE_TYPES } from "@/lib/utils"
import {
  ArrowLeft, Building2, User, CreditCard, FileText, Receipt,
  Calendar as CalendarIcon, Wallet, TrendingDown, ClipboardList, MessageSquare,
} from "lucide-react"
import Link from "next/link"
import { DeleteTenantButton } from "../delete-tenant-button"
import { DocumentsChecklist } from "./documents-checklist"
import { FullFloorAssign } from "./full-floor-assign"
import { DocumentsActions } from "./documents-actions"
import { EmailLog } from "./email-log"

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const { id } = await params
  try {
    await assertTenantInOrg(id, orgId)
  } catch {
    notFound()
  }

  const tenant = await db.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      companyName: true,
      legalType: true,
      bin: true,
      iin: true,
      bankName: true,
      iik: true,
      bik: true,
      category: true,
      legalAddress: true,
      actualAddress: true,
      directorName: true,
      directorPosition: true,
      cleaningFee: true,
      needsCleaning: true,
      customRate: true,
      contractStart: true,
      contractEnd: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
      space: {
        select: {
          id: true, number: true, area: true, status: true, description: true,
          floor: { select: { id: true, name: true, ratePerSqm: true } },
        },
      },
      charges: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, period: true, type: true, amount: true, description: true, isPaid: true, dueDate: true, createdAt: true },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
        take: 10,
        select: { id: true, amount: true, method: true, paymentDate: true, note: true },
      },
      contracts: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, number: true, status: true, startDate: true, endDate: true, signedAt: true },
      },
      requests: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, status: true, priority: true, createdAt: true },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, name: true, fileUrl: true, createdAt: true },
      },
    },
  })

  if (!tenant) notFound()

  const totalDebt = tenant.charges
    .filter((c) => !c.isPaid)
    .reduce((s, c) => s + c.amount, 0)

  // Дни до окончания договора (отрицательное = истёк)
  const today = new Date()
  const daysToContractEnd = tenant.contractEnd
    ? Math.ceil((tenant.contractEnd.getTime() - today.getTime()) / 86_400_000)
    : null

  // Период = текущий месяц для генератора счёта
  const currentPeriod = today.toISOString().slice(0, 7)

  const vacantSpaces = await db.space.findMany({
    where: { status: "VACANT" },
    select: {
      id: true, number: true, area: true,
      floor: { select: { id: true, name: true, number: true } },
    },
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  })

  // Email лог (может упасть если миграция 008 не применена)
  const emailLogs = await db.emailLog.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sentAt: "desc" },
    take: 30,
    select: {
      id: true, recipient: true, subject: true, type: true, status: true,
      externalId: true, error: true, openedAt: true, openCount: true, sentAt: true,
    },
  }).catch(() => [] as Array<{
    id: string; recipient: string; subject: string; type: string; status: string;
    externalId: string | null; error: string | null; openedAt: Date | null; openCount: number; sentAt: Date
  }>)

  const allFloors = await db.floor.findMany({
    select: { id: true, name: true, totalArea: true, ratePerSqm: true, fullFloorTenantId: true, fixedMonthlyRent: true },
    orderBy: { number: "asc" },
  }).catch(() => [] as Array<{ id: string; name: string; totalArea: number | null; ratePerSqm: number; fullFloorTenantId: string | null; fixedMonthlyRent: number | null }>)

  const myFullFloors = allFloors
    .filter((f) => f.fullFloorTenantId === tenant.id)
    .map((f) => ({ id: f.id, name: f.name, fixedMonthlyRent: f.fixedMonthlyRent }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/tenants"
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{tenant.companyName}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
            {LEGAL_TYPE_LABELS[tenant.legalType] ?? tenant.legalType}
            {tenant.category ? ` · ${tenant.category}` : ""}
          </p>
        </div>
        <DeleteTenantButton
          tenantId={tenant.id}
          companyName={tenant.companyName}
          redirectAfter
        />
      </div>

      {/* Quick stats + actions */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <QuickStat
            icon={Wallet}
            label="Текущий долг"
            value={totalDebt > 0 ? formatMoney(totalDebt) : "Нет"}
            valueClass={totalDebt > 0 ? "text-red-600" : "text-emerald-600"}
            sub={totalDebt > 0 ? `${tenant.charges.filter((c) => !c.isPaid).length} начислений` : "Все оплачено"}
          />
          <QuickStat
            icon={Building2}
            label="Помещение"
            value={tenant.space ? `Каб. ${tenant.space.number}` : myFullFloors[0] ? myFullFloors[0].name : "—"}
            valueClass="text-slate-900 dark:text-slate-100"
            sub={tenant.space ? `${tenant.space.area} м² · ${tenant.space.floor.name}` : myFullFloors.length > 0 ? "Целый этаж" : "Не назначено"}
          />
          <QuickStat
            icon={CalendarIcon}
            label="До конца договора"
            value={daysToContractEnd === null ? "—" : daysToContractEnd < 0 ? "Истёк" : `${daysToContractEnd} дн.`}
            valueClass={
              daysToContractEnd === null ? "text-slate-500 dark:text-slate-400 dark:text-slate-500"
                : daysToContractEnd < 0 ? "text-red-600"
                : daysToContractEnd < 30 ? "text-amber-600"
                : "text-slate-900 dark:text-slate-100"
            }
            sub={tenant.contractEnd ? formatDate(tenant.contractEnd) : "Договор не заключён"}
          />
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <Link
            href={`/admin/documents/templates/invoice?tenantId=${tenant.id}&period=${currentPeriod}`}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Receipt className="h-3.5 w-3.5" />
            Создать счёт
          </Link>
          <Link
            href={`/admin/documents/templates/act?tenantId=${tenant.id}&period=${currentPeriod}`}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            <FileText className="h-3.5 w-3.5" />
            Создать акт услуг
          </Link>
          <Link
            href={`/admin/documents/templates/reconciliation?tenantId=${tenant.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <TrendingDown className="h-3.5 w-3.5" />
            Акт сверки
          </Link>
          <Link
            href={`/admin/messages?to=${tenant.userId}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Написать
          </Link>
          <Link
            href={`/admin/requests?tenantId=${tenant.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Заявки
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column: forms */}
        <div className="col-span-2 space-y-5">
          {/* Contact info */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <User className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Контактное лицо</h2>
            </div>
            <form
              action={async (formData: FormData) => {
                "use server"
                await updateTenantUser(tenant.userId, tenant.id, formData)
              }}
              className="p-5 grid grid-cols-2 gap-4"
            >
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">ФИО</label>
                <input
                  name="name"
                  defaultValue={tenant.user.name}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Телефон</label>
                <input
                  name="phone"
                  defaultValue={tenant.user.phone ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Email</label>
                <input
                  name="email"
                  type="email"
                  defaultValue={tenant.user.email ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Building2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Данные компании</h2>
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
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Название компании</label>
                <input
                  name="companyName"
                  defaultValue={tenant.companyName}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Правовая форма</label>
                <select
                  name="legalType"
                  defaultValue={tenant.legalType}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900"
                >
                  <option value="IP">ИП</option>
                  <option value="TOO">ТОО</option>
                  <option value="AO">АО</option>
                  <option value="PHYSICAL">Физ. лицо</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">БИН (для ТОО/АО)</label>
                <input
                  name="bin"
                  defaultValue={tenant.bin ?? ""}
                  placeholder="12 цифр"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">ИИН (для ИП/физлица)</label>
                <input
                  name="iin"
                  defaultValue={tenant.iin ?? ""}
                  placeholder="12 цифр"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Вид деятельности</label>
                <input
                  name="category"
                  defaultValue={tenant.category ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Юридический адрес</label>
                <input
                  name="legalAddress"
                  defaultValue={tenant.legalAddress ?? ""}
                  placeholder="г. Усть-Каменогорск, ул..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Фактический адрес</label>
                <input
                  name="actualAddress"
                  defaultValue={tenant.actualAddress ?? ""}
                  placeholder="Если совпадает с юридическим — оставьте пустым"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">ФИО руководителя</label>
                <input
                  name="directorName"
                  defaultValue={tenant.directorName ?? ""}
                  placeholder="Иванов Иван Иванович"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Должность руководителя</label>
                <input
                  name="directorPosition"
                  defaultValue={tenant.directorPosition ?? ""}
                  placeholder="Директор / Учредитель"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Начало договора</label>
                <input
                  name="contractStart"
                  type="date"
                  defaultValue={tenant.contractStart?.toISOString().slice(0, 10) ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Конец договора</label>
                <input
                  name="contractEnd"
                  type="date"
                  defaultValue={tenant.contractEnd?.toISOString().slice(0, 10) ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <CreditCard className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Банковские реквизиты</h2>
            </div>
            <form
              action={async (formData: FormData) => {
                "use server"
                await updateTenantRequisites(tenant.id, formData)
              }}
              className="p-5 grid grid-cols-2 gap-4"
            >
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Название банка</label>
                <input
                  name="bankName"
                  defaultValue={tenant.bankName ?? ""}
                  placeholder="Kaspi Bank / Halyk / и т.д."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">ИИК (расчётный счёт)</label>
                <input
                  name="iik"
                  defaultValue={tenant.iik ?? ""}
                  placeholder="KZxxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">БИК банка</label>
                <input
                  name="bik"
                  defaultValue={tenant.bik ?? ""}
                  placeholder="CASPKZKA"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">БИН / ИИН</label>
                <input
                  name="bin"
                  defaultValue={tenant.bin ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Receipt className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Условия аренды</h2>
            </div>
            <form
              action={async (formData: FormData) => {
                "use server"
                await updateTenantRentalTerms(tenant.id, formData)
              }}
              className="p-5 grid grid-cols-3 gap-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Индивид. ставка ₸/м²</label>
                <input
                  name="customRate"
                  type="number"
                  step="0.01"
                  defaultValue={tenant.customRate ?? ""}
                  placeholder="Если отличается от этажной"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Уборка ₸/мес</label>
                <input
                  name="cleaningFee"
                  type="number"
                  step="0.01"
                  defaultValue={tenant.cleaningFee}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
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

          {/* Documents actions: invoice, act, contract, handover */}
          <DocumentsActions
            tenantId={tenant.id}
            tenantHasEmail={!!tenant.user.email}
          />

          {/* Email log */}
          <EmailLog items={emailLogs} />

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
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-2">ПОМЕЩЕНИЕ</p>
            {tenant.space ? (
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">Каб. {tenant.space.number}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{tenant.space.floor.name}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 mt-2">{tenant.space.area} м²</p>
                {tenant.customRate ? (
                  <p className="text-xs text-blue-600 mt-1">Инд. ставка: {formatMoney(tenant.customRate)}/м²</p>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Ставка этажа: {formatMoney(tenant.space.floor.ratePerSqm)}/м²
                  </p>
                )}
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-2">
                  Аренда: {formatMoney(
                    tenant.space.area * (tenant.customRate ?? tenant.space.floor.ratePerSqm)
                  )}/мес
                </p>
                <Link
                  href={`/admin/documents/templates/rental?tenantId=${tenant.id}`}
                  className="mt-3 block text-center rounded-lg border border-slate-200 dark:border-slate-800 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-colors"
                >
                  Сформировать договор
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-400 dark:text-slate-500 mb-3">Помещение не назначено</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-2 font-medium">Свободные помещения:</p>
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
                        className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <span className="font-medium">Каб. {s.number}</span>
                        <span className="text-slate-400 dark:text-slate-500 ml-1">· {s.floor.name} · {s.area} м²</span>
                      </button>
                    </form>
                  ))}
                  {vacantSpaces.length === 0 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">Нет свободных помещений</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Contracts */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Договоры</p>
            </div>
            <div className="divide-y divide-slate-50">
              {tenant.contracts.map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">№ {c.number}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
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
                <p className="px-4 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">Нет договоров</p>
              )}
            </div>
          </div>

          {/* Recent charges */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Последние начисления</p>
            </div>
            <div className="divide-y divide-slate-50">
              {tenant.charges.slice(0, 6).map((c) => (
                <div key={c.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {CHARGE_TYPES[c.type] ?? c.type}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{c.period}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${c.isPaid ? "text-emerald-600" : "text-red-600"}`}>
                      {formatMoney(c.amount)}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{c.isPaid ? "Оплачено" : "Долг"}</p>
                  </div>
                </div>
              ))}
              {tenant.charges.length === 0 && (
                <p className="px-4 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">Начислений нет</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickStat({
  icon: Icon, label, value, valueClass, sub,
}: {
  icon: React.ElementType
  label: string
  value: string
  valueClass?: string
  sub?: string
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-lg font-bold ${valueClass ?? "text-slate-900 dark:text-slate-100"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}
