import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg, assertTenantInOrg } from "@/lib/scope-guards"
import { getCurrentBuildingId } from "@/lib/current-building"
import { spaceScope } from "@/lib/tenant-scope"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import {
  updateTenant,
  updateTenantUser,
  assignTenantSpace,
  unassignTenantSpace,
} from "@/app/actions/tenant"
import { formatMoney, formatDate, LEGAL_TYPE_LABELS, CHARGE_TYPES } from "@/lib/utils"
import {
  ArrowLeft, Building2, User, CreditCard, FileText, Receipt,
  Calendar as CalendarIcon, Wallet, TrendingDown, ClipboardList, MessageSquare, Zap,
} from "lucide-react"
import Link from "next/link"
import { DeleteTenantButton } from "../delete-tenant-button"
import { BlacklistButton } from "./blacklist-button"
import { IndexationHint } from "./indexation-hint"
import { ContractWorkflowActions } from "./contract-actions"
import {
  DocumentsActionsLoader,
  RentalTermsFormLoader,
  RequisitesFormLoader,
} from "./client-section-loaders"
import { calculateTenantMonthlyRent, calculateTenantRatePerSqm, hasFixedTenantRent } from "@/lib/rent"
import { getTenantAreaTotal, getTenantPrimaryBuildingId } from "@/lib/tenant-placement"
import { AsciiEmailInput, KzPhoneInput } from "@/components/forms/contact-inputs"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { TenantIdentityFields } from "../tenant-identity-fields"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import type { Prisma } from "@/app/generated/prisma/client"
import { TenantDocumentsSection } from "./tenant-documents-section"
import { TenantEmailLogSection } from "./tenant-email-log-section"
import { TenantFullFloorSection } from "./tenant-full-floor-section"
import { TenantHistorySection } from "./tenant-history-section"
import { TenantServiceChargesSection } from "./tenant-service-charges-section"
import { measureServerRoute } from "@/lib/server-performance"

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return measureServerRoute("/admin/tenants/[id]", async () => {
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
      bankAccounts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          label: true,
          bankName: true,
          iik: true,
          bik: true,
          isPrimary: true,
        },
      },
      blacklistedAt: true,
      blacklistReason: true,
      category: true,
      legalAddress: true,
      actualAddress: true,
      directorName: true,
      directorPosition: true,
      cleaningFee: true,
      needsCleaning: true,
      customRate: true,
      fixedMonthlyRent: true,
      paymentDueDay: true,
      penaltyPercent: true,
      isVatPayer: true,
      contractStart: true,
      contractEnd: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
      space: {
        select: {
          id: true, number: true, area: true, status: true, description: true,
          floor: { select: { id: true, name: true, ratePerSqm: true, buildingId: true } },
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
              status: true,
              description: true,
              floor: { select: { id: true, name: true, ratePerSqm: true, buildingId: true } },
            },
          },
        },
      },
      fullFloors: {
        select: {
          id: true,
          name: true,
          totalArea: true,
          fixedMonthlyRent: true,
          buildingId: true,
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
        select: {
          id: true, number: true, type: true, status: true,
          startDate: true, endDate: true, signedAt: true,
          sentAt: true, viewedAt: true, signedByTenantAt: true, signedByLandlordAt: true,
          rejectedAt: true, rejectionReason: true, signToken: true,
        },
      },
      requests: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, status: true, priority: true, createdAt: true },
      },
    },
  })

  if (!tenant) notFound()
  const currentBuildingId = await getCurrentBuildingId().catch(() => null)
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const tenantBuildingId = getTenantPrimaryBuildingId(tenant)
  const buildingId = currentBuildingId ?? tenantBuildingId
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds

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
  const serviceDueDay = Math.min(tenant.paymentDueDay ?? 10, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate())
  const defaultServiceDueDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(serviceDueDay).padStart(2, "0"),
  ].join("-")

  const vacantSpacesWhere: Prisma.SpaceWhereInput = {
    AND: [
      spaceScope(orgId),
      { status: "VACANT", kind: "RENTABLE" },
      { tenantSpaces: { none: {} } },
      { tenant: null },
      { floor: { buildingId: { in: visibleBuildingIds } } },
    ],
  }

  const [vacantSpaces, vacantSpacesCount] = await Promise.all([
    db.space.findMany({
      where: vacantSpacesWhere,
      select: {
        id: true, number: true, area: true,
        floor: { select: { id: true, name: true, number: true } },
      },
      orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
      take: 50,
    }),
    db.space.count({ where: vacantSpacesWhere }).catch(() => 0),
  ])

  const myFullFloors = tenant.fullFloors.map((f) => ({
    id: f.id,
    name: f.name,
    totalArea: f.totalArea,
    fixedMonthlyRent: f.fixedMonthlyRent,
  }))
  const assignedSpaces = tenant.tenantSpaces.length > 0
    ? tenant.tenantSpaces.map((item) => item.space)
    : tenant.space ? [tenant.space] : []
  const rentInput = { ...tenant, fullFloors: myFullFloors }
  const monthlyRent = calculateTenantMonthlyRent(rentInput)
  const ratePerSqm = calculateTenantRatePerSqm(tenant)
  const fullFloorArea = getTenantAreaTotal({ fullFloors: myFullFloors })
  const hasTenantFixedRent = hasFixedTenantRent(tenant.fixedMonthlyRent)
  const fullFloorsWithFixedRent = myFullFloors.filter((floor) => hasFixedTenantRent(floor.fixedMonthlyRent))
  const fullFloorRentTotal = fullFloorsWithFixedRent.reduce((sum, floor) => sum + (floor.fixedMonthlyRent ?? 0), 0)
  const hasTenantCustomRate = hasFixedTenantRent(tenant.customRate)
  const rentalTermsLocked = fullFloorsWithFixedRent.length > 0 || hasTenantFixedRent || hasTenantCustomRate
  const rentalTermsLockReason = fullFloorsWithFixedRent.length > 0
    ? `У арендатора указана стоимость за этажи ${fullFloorsWithFixedRent.map((floor) => floor.name).join(", ")}: ${formatMoney(fullFloorRentTotal)}/мес.`
    : hasTenantFixedRent
      ? `У арендатора указана индивидуальная сумма аренды: ${formatMoney(tenant.fixedMonthlyRent ?? 0)}/мес.`
      : hasTenantCustomRate
        ? `У арендатора указана индивидуальная ставка аренды: ${formatMoney(tenant.customRate ?? 0)}/м².`
        : null

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
        <div className="flex items-center gap-2">
          <BlacklistButton
            tenantId={tenant.id}
            companyName={tenant.companyName}
            blacklistedAt={tenant.blacklistedAt}
            blacklistReason={tenant.blacklistReason}
          />
          <DeleteTenantButton
            tenantId={tenant.id}
            companyName={tenant.companyName}
            redirectAfter
          />
        </div>
      </div>

      {/* Quick stats + actions */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <QuickStat
            icon={Wallet}
            label="Текущий долг"
            value={totalDebt > 0 ? formatMoney(totalDebt) : "Нет"}
            valueClass={totalDebt > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}
            sub={totalDebt > 0 ? `${tenant.charges.filter((c) => !c.isPaid).length} начислений` : "Все оплачено"}
          />
          <QuickStat
            icon={Building2}
            label="Помещение"
            value={assignedSpaces.length > 1 ? `${assignedSpaces.length} помещ.` : assignedSpaces[0] ? `Каб. ${assignedSpaces[0].number}` : myFullFloors.length > 1 ? `${myFullFloors.length} этажей` : myFullFloors[0] ? myFullFloors[0].name : "—"}
            valueClass="text-slate-900 dark:text-slate-100"
            sub={assignedSpaces.length > 0 ? `${assignedSpaces.reduce((sum, space) => sum + space.area, 0)} м²` : myFullFloors.length > 0 ? `${fullFloorArea} м²` : "Не назначено"}
          />
          <QuickStat
            icon={CalendarIcon}
            label="До конца договора"
            value={daysToContractEnd === null ? "—" : daysToContractEnd < 0 ? "Истёк" : `${daysToContractEnd} дн.`}
            valueClass={
              daysToContractEnd === null ? "text-slate-500 dark:text-slate-400 dark:text-slate-500"
                : daysToContractEnd < 0 ? "text-red-600 dark:text-red-400"
                : daysToContractEnd < 30 ? "text-amber-600 dark:text-amber-400"
                : "text-slate-900 dark:text-slate-100"
            }
            sub={tenant.contractEnd ? formatDate(tenant.contractEnd) : "Договор не заключён"}
          />
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <Link
            href={`/admin/documents/new/invoice?tenantId=${tenant.id}&period=${currentPeriod}`}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Receipt className="h-3.5 w-3.5" />
            Создать счёт
          </Link>
          <Link
            href={`/admin/documents/new/act?tenantId=${tenant.id}&period=${currentPeriod}`}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            <FileText className="h-3.5 w-3.5" />
            Создать акт услуг
          </Link>
          <Link
            href={`/admin/documents/new/reconciliation?tenantId=${tenant.id}`}
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
          <CollapsibleCard
            title="Контактное лицо"
            icon={User}
            meta={tenant.user.phone ?? tenant.user.email ?? "контакты не заполнены"}
          >
            <form
              action={async (formData: FormData) => {
                "use server"
                await updateTenantUser(tenant.userId, tenant.id, formData)
              }}
              className="p-5 grid grid-cols-2 gap-4"
            >
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">ФИО</label>
                <AddressAutocompleteInput
                  name="name"
                  defaultValue={tenant.user.name}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Телефон</label>
                <KzPhoneInput
                  name="phone"
                  defaultValue={tenant.user.phone}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Email</label>
                <AsciiEmailInput
                  name="email"
                  defaultValue={tenant.user.email}
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
          </CollapsibleCard>

          {/* Company info */}
          <CollapsibleCard
            title="Данные компании"
            icon={Building2}
            meta={`${LEGAL_TYPE_LABELS[tenant.legalType] ?? tenant.legalType} · ${tenant.category ?? "вид деятельности не указан"}`}
          >
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
              <input type="hidden" name="fixedMonthlyRent" value={tenant.fixedMonthlyRent ?? ""} />

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Название компании</label>
                <input
                  name="companyName"
                  defaultValue={tenant.companyName}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <TenantIdentityFields
                initialLegalType={tenant.legalType}
                initialBin={tenant.bin}
                initialIin={tenant.iin}
              />
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
                <AddressAutocompleteInput
                  name="legalAddress"
                  defaultValue={tenant.legalAddress ?? ""}
                  includeStructuredFields={false}
                  placeholder="г. Усть-Каменогорск, ул..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Фактический адрес</label>
                <AddressAutocompleteInput
                  name="actualAddress"
                  defaultValue={tenant.actualAddress ?? ""}
                  includeStructuredFields={false}
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
              <IndexationHint
                initialContractEnd={tenant.contractEnd?.toISOString().slice(0, 10) ?? null}
                initialRate={ratePerSqm}
                monthlyRent={monthlyRent}
              />
              <div className="col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </CollapsibleCard>

          {/* Requisites */}
          <CollapsibleCard
            title="Банковские реквизиты"
            icon={CreditCard}
            meta={tenant.bankAccounts.length > 0 ? `${tenant.bankAccounts.length} сч.` : tenant.bankName ?? tenant.iik ?? "не заполнены"}
          >
            <RequisitesFormLoader
              tenantId={tenant.id}
              isIin={tenant.legalType === "IP" || tenant.legalType === "PHYSICAL"}
              initial={{
                bankName: tenant.bankName,
                  iik: tenant.iik,
                  bik: tenant.bik,
                  bin: tenant.bin,
                  iin: tenant.iin,
                  bankAccounts: tenant.bankAccounts,
                }}
              />
          </CollapsibleCard>

          {/* Rental terms */}
          <CollapsibleCard
            title="Условия аренды"
            icon={Receipt}
            meta={`${formatMoney(monthlyRent)}/мес`}
          >
            <RentalTermsFormLoader
              tenantId={tenant.id}
              locked={rentalTermsLocked}
              lockedReason={rentalTermsLockReason}
              initial={{
                customRate: tenant.customRate,
                fixedMonthlyRent: tenant.fixedMonthlyRent,
                cleaningFee: tenant.cleaningFee,
                needsCleaning: tenant.needsCleaning,
                paymentDueDay: tenant.paymentDueDay ?? 10,
                penaltyPercent: tenant.penaltyPercent ?? 1,
                isVatPayer: tenant.isVatPayer,
              }}
            />
          </CollapsibleCard>

          {/* Service charges */}
          <CollapsibleCard
            title="Дополнительные начисления"
            icon={Zap}
            meta={`за ${currentPeriod}`}
          >
            <Suspense fallback={<SectionFallback />}>
              <TenantServiceChargesSection
                tenantId={tenant.id}
                period={currentPeriod}
                defaultDueDate={defaultServiceDueDate}
              />
            </Suspense>
          </CollapsibleCard>

          {/* Documents actions: invoice, act, contract, handover */}
          <DocumentsActionsLoader
            tenantId={tenant.id}
            tenantHasEmail={!!tenant.user.email}
          />

          {/* Email log */}
          <Suspense fallback={<SectionFallback />}>
            <TenantEmailLogSection tenantId={tenant.id} />
          </Suspense>

          {/* Documents checklist */}
          <Suspense fallback={<SectionFallback />}>
            <TenantDocumentsSection tenantId={tenant.id} legalType={tenant.legalType} />
          </Suspense>

          {/* История изменений */}
          <Suspense fallback={<SectionFallback />}>
            <TenantHistorySection tenantId={tenant.id} userId={tenant.userId} />
          </Suspense>
        </div>

        {/* Right column: info cards */}
        <div className="space-y-5">
          {/* Full floor assign */}
          <Suspense fallback={<SectionFallback />}>
            <TenantFullFloorSection
              tenantId={tenant.id}
              orgId={orgId}
              visibleBuildingIds={visibleBuildingIds}
              currentFloors={myFullFloors}
            />
          </Suspense>

          {/* Space */}
          <CollapsibleCard
            title="Помещения"
            icon={Building2}
            meta={assignedSpaces.length > 0 ? `${assignedSpaces.length} помещ. · ${assignedSpaces.reduce((sum, space) => sum + space.area, 0)} м²` : myFullFloors.length > 0 ? `${myFullFloors.length} этаж. · ${fullFloorArea} м²` : "не назначено"}
          >
            <div className="p-4">
              {assignedSpaces.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {assignedSpaces.map((space, index) => (
                      <div key={space.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                              Каб. {space.number}
                              {index === 0 && (
                                <span className="ml-2 align-middle rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                                  Основное
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{space.floor.name}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 mt-1">{space.area} м²</p>
                          </div>
                          <form
                            action={async () => {
                              "use server"
                              await unassignTenantSpace(tenant.id, space.id)
                            }}
                          >
                            <button
                              type="submit"
                              className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                            >
                              Снять
                            </button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasTenantFixedRent ? (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Инд. сумма: {formatMoney(tenant.fixedMonthlyRent ?? 0)}/мес</p>
                  ) : tenant.customRate ? (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Инд. ставка: {formatMoney(tenant.customRate)}/м²</p>
                  ) : (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      Расчёт по ставкам этажей
                    </p>
                  )}
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-2">
                    Аренда: {formatMoney(monthlyRent)}/мес
                  </p>
                  <Link
                    href={`/admin/documents/new/contract?tenantId=${tenant.id}`}
                    className="mt-3 block text-center rounded-lg border border-slate-200 dark:border-slate-800 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-colors"
                  >
                    Сформировать договор
                  </Link>
                </div>
              ) : myFullFloors.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {myFullFloors.map((floor) => (
                      <div key={floor.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{floor.name}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{floor.totalArea ?? 0} м²</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          {formatMoney(floor.fixedMonthlyRent ?? 0)}/мес
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-2">
                    Аренда всего: {formatMoney(monthlyRent)}/мес
                  </p>
                  <Link
                    href={`/admin/documents/new/contract?tenantId=${tenant.id}`}
                    className="mt-3 block text-center rounded-lg border border-slate-200 dark:border-slate-800 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    Сформировать договор
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-slate-400 dark:text-slate-500 mb-3">Помещение не назначено</p>
                </div>
              )}
              <div className={assignedSpaces.length > 0 ? "mt-4 border-t border-slate-100 pt-4 dark:border-slate-800" : ""}>
                <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-2 font-medium">
                  {assignedSpaces.length > 0 ? "Добавить ещё помещение:" : "Свободные помещения:"}
                </p>
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
                        className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:border-blue-300 dark:border-blue-500/40 hover:bg-blue-50 dark:hover:bg-blue-500/10 dark:bg-blue-500/10 transition-colors"
                      >
                        <span className="font-medium">Каб. {s.number}</span>
                        <span className="text-slate-400 dark:text-slate-500 ml-1">· {s.floor.name} · {s.area} м²</span>
                      </button>
                    </form>
                  ))}
                  {vacantSpaces.length === 0 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">Нет свободных помещений</p>
                  )}
                  {vacantSpacesCount > vacantSpaces.length && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Показаны первые {vacantSpaces.length} из {vacantSpacesCount}. Для точного выбора откройте страницу помещений выбранного здания.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CollapsibleCard>

          {/* Contracts */}
          <CollapsibleCard title="Договоры" icon={FileText} meta={`${tenant.contracts.length} шт.`}>
            <div className="divide-y divide-slate-50">
              {tenant.contracts.map((c) => {
                const statusLabels: Record<string, { label: string; cls: string }> = {
                  DRAFT:               { label: "Черновик",           cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" },
                  SENT:                { label: "Отправлен",          cls: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300" },
                  VIEWED:              { label: "Открыт арендатором", cls: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300" },
                  SIGNED_BY_TENANT:    { label: "Ждёт нашей подписи", cls: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300" },
                  SIGNED:              { label: "Подписан",           cls: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" },
                  REJECTED:            { label: "Отклонён",           cls: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300" },
                }
                const st = statusLabels[c.status] ?? { label: c.status, cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" }
                const docLabel = c.type === "ADDENDUM" ? "Доп. соглашение" : "Договор"
                return (
                  <div key={c.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{docLabel} № {c.number}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {c.startDate ? formatDate(c.startDate) : "—"} → {c.endDate ? formatDate(c.endDate) : "—"}
                    </p>
                    <div className="mt-2">
                      <ContractWorkflowActions contract={c} />
                    </div>
                  </div>
                )
              })}
              {tenant.contracts.length === 0 && (
                <p className="px-4 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">Нет договоров</p>
              )}
            </div>
          </CollapsibleCard>

          {/* Recent charges */}
          <CollapsibleCard title="Последние начисления" icon={Receipt} meta={`${tenant.charges.length} записей`}>
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
                    <p className={`text-xs font-semibold ${c.isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
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
          </CollapsibleCard>
        </div>
      </div>
    </div>
  )
  })
}

function SectionFallback() {
  return (
    <div className="p-5">
      <div className="h-4 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mt-4 space-y-2">
        <div className="h-9 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
        <div className="h-9 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
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
