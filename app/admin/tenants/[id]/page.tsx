// force-dynamic чтобы после updateTenant новый рендер сразу видел свежие данные
// без 60-секундной задержки кэша Next.js (см. AUDIT_2026-05-26.md).
export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
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
import { formatMoney, formatDate, LEGAL_TYPE_LABELS } from "@/lib/utils"
import {
  ArrowLeft, Building2, User, CreditCard, FileText, Receipt,
  Calendar as CalendarIcon, Wallet, TrendingDown, ClipboardList, MessageSquare, Zap,
  FileSignature, CheckCircle2, AlertTriangle,
  Mail, History as HistoryIcon, Layers, ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { DeleteTenantButton } from "../delete-tenant-button"
import { BlacklistButton } from "./blacklist-button"
import { IndexationHint } from "./indexation-hint"
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
import { Tabs, Tab } from "@/components/ui/server-tabs"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { Button } from "@/components/ui/button"
import type { Prisma } from "@/app/generated/prisma/client"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import { coerceKzVatRate, DEFAULT_KZ_VAT_RATE, KZ_VAT_RATE_OPTIONS } from "@/lib/kz-vat"
import { safeServerValue } from "@/lib/server-fallback"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import {
  TenantLazyContractsSidebar,
  TenantLazyDocumentsChecklist,
  TenantLazyEmailLog,
  TenantLazyFullFloor,
  TenantLazyHistory,
  TenantLazyRecentChargesSidebar,
  TenantLazySectionsProvider,
  TenantLazyServiceCharges,
} from "./tenant-lazy-sections"
import { ChargesByContractSection } from "./charges-by-contract"

type TenantHealthItem = {
  label: string
  value: string
  ok: boolean
  href: string
}

type TenantPrimaryAction = {
  label: string
  description: string
  href: string
} | null

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return measureServerRoute("/admin/tenants/[id]", async () => {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const allowedCapabilities = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
    orgId,
  }))
  const canEditContacts = allowedCapabilities.has("tenants.editContacts")
  const canEditCompany = allowedCapabilities.has("tenants.editCompany")
  const canEditRentalTerms = allowedCapabilities.has("tenants.editRentalTerms")
  const canAssignTenantSpaces = allowedCapabilities.has("tenants.assignSpaces")
  const canBlacklistTenant = allowedCapabilities.has("tenants.blacklist")
  const canDeleteTenant = allowedCapabilities.has("tenants.delete")
  const canCreateDocuments = allowedCapabilities.has("documents.create")
  const canCreateInvoice = allowedCapabilities.has("finance.createInvoice")
  const canRecordPayment = allowedCapabilities.has("finance.recordPayment")
  const canSendMessages = allowedCapabilities.has("messages.send")
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, {
      source,
      route: "/admin/tenants/[id]",
      orgId,
      userId: session.user.id,
    })

  const { id } = await params
  try {
    await assertTenantInOrg(id, orgId)
  } catch {
    notFound()
  }

  const tenant = await measureServerStep("/admin/tenants/[id]", "tenant-main", db.tenant.findUnique({
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
      usePurpose: true,
      basisDocument: true,
      cleaningFee: true,
      needsCleaning: true,
      customRate: true,
      fixedMonthlyRent: true,
      paymentDueDay: true,
      penaltyPercent: true,
      isVatPayer: true,
      vatRate: true,
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
      _count: {
        select: {
          contracts: { where: { status: "SIGNED" } },
        },
      },
    },
  }))

  if (!tenant) notFound()
  const currentBuildingId = await getCurrentBuildingId().catch(() => null)
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const tenantBuildingId = getTenantPrimaryBuildingId(tenant)
  const buildingId = currentBuildingId ?? tenantBuildingId
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds

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

  const [vacantSpacesPreview, debtAgg] = await measureServerStep("/admin/tenants/[id]", "assignable-spaces-and-debt", Promise.all([
    db.space.findMany({
      where: vacantSpacesWhere,
      select: {
        id: true, number: true, area: true,
        floor: { select: { id: true, name: true, number: true } },
      },
      orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
      take: 51,
    }),
    safe(
      "tenantDetail.debtAggregate",
      // deletedAt:null — иначе долг расходится с /cabinet/finances и /admin/dashboard/owner.
      db.charge.aggregate({
        where: { tenantId: tenant.id, isPaid: false, deletedAt: null },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
  ]))

  const vacantSpacesHasMore = vacantSpacesPreview.length > 50
  const vacantSpaces = vacantSpacesPreview.slice(0, 50)
  const signedContractsCount = tenant._count.contracts
  const totalDebt = debtAgg._sum.amount ?? 0
  const debtCount = debtAgg._count._all ?? 0

  const myFullFloors = tenant.fullFloors.map((f) => ({
    id: f.id,
    name: f.name,
    totalArea: f.totalArea,
    fixedMonthlyRent: f.fixedMonthlyRent,
  }))
  const assignedSpaces = tenant.tenantSpaces.length > 0
    ? tenant.tenantSpaces.map((item) => item.space)
    : tenant.space ? [tenant.space] : []
  const tenantVatRate = coerceKzVatRate(tenant.vatRate, DEFAULT_KZ_VAT_RATE)
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
  const hasPlacement = assignedSpaces.length > 0 || myFullFloors.length > 0
  const hasContact = Boolean((tenant.user.phone ?? "").trim() || (tenant.user.email ?? "").trim())
  const hasBankDetails = tenant.bankAccounts.length > 0 || Boolean((tenant.bankName ?? "").trim() && (tenant.iik ?? "").trim() && (tenant.bik ?? "").trim())
  const hasSignedContract = signedContractsCount > 0
  const tenantHealthItems: TenantHealthItem[] = [
    {
      label: "Долг",
      value: totalDebt > 0 ? formatMoney(totalDebt) : "нет",
      ok: totalDebt <= 0,
      href: `/admin/finances?tenantId=${tenant.id}`,
    },
    {
      label: "Договор",
      value: hasSignedContract ? "подписан" : "нет подписанного",
      ok: hasSignedContract,
      href: `/admin/documents/new/contract?tenantId=${tenant.id}`,
    },
    {
      label: "Помещение",
      value: hasPlacement ? "назначено" : "не назначено",
      ok: hasPlacement,
      href: "#tenant-placement",
    },
    {
      label: "Контакты",
      value: hasContact ? "заполнены" : "не заполнены",
      ok: hasContact,
      href: "#tenant-contact",
    },
    {
      label: "Реквизиты",
      value: hasBankDetails ? "заполнены" : "не заполнены",
      ok: hasBankDetails,
      href: "#tenant-requisites",
    },
  ]
  const tenantPrimaryAction: TenantPrimaryAction = totalDebt > 0
    ? {
        label: "Проверить долг",
        description: `Есть неоплаченные начисления: ${formatMoney(totalDebt)}.`,
        href: `/admin/finances?tenantId=${tenant.id}`,
      }
    : !hasPlacement
      ? {
          label: "Назначить помещение",
          description: "Без помещения нельзя корректно формировать договоры и начисления.",
          href: "#tenant-placement",
        }
      : !hasSignedContract
        ? {
            label: "Создать договор",
            description: "У арендатора нет подписанного договора в системе.",
            href: `/admin/documents/new/contract?tenantId=${tenant.id}`,
          }
        : !hasBankDetails
          ? {
              label: "Заполнить реквизиты",
              description: "Реквизиты нужны для договоров, счетов и актов.",
              href: "#tenant-requisites",
            }
          : !hasContact
            ? {
                label: "Заполнить контакты",
                description: "Телефон или email нужны для связи и уведомлений.",
                href: "#tenant-contact",
              }
            : null

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Главная", href: "/admin" },
          { label: "Арендаторы", href: "/admin/tenants" },
          { label: tenant.companyName },
        ]}
      />
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/tenants"
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{tenant.companyName}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {LEGAL_TYPE_LABELS[tenant.legalType] ?? tenant.legalType}
            {tenant.category ? ` · ${tenant.category}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canBlacklistTenant && (
          <BlacklistButton
            tenantId={tenant.id}
            companyName={tenant.companyName}
            blacklistedAt={tenant.blacklistedAt}
            blacklistReason={tenant.blacklistReason}
          />
          )}
          {canDeleteTenant && (
          <DeleteTenantButton
            tenantId={tenant.id}
            companyName={tenant.companyName}
            redirectAfter
          />
          )}
        </div>
      </div>

      {/* Quick stats + actions */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-slate-100 dark:divide-slate-800 md:grid-cols-3 md:divide-x md:divide-y-0">
          <QuickStat
            icon={Wallet}
            label="Текущий долг"
            value={totalDebt > 0 ? formatMoney(totalDebt) : "Нет"}
            valueClass={totalDebt > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}
            sub={totalDebt > 0 ? `${debtCount} начислений` : "Все оплачено"}
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
              daysToContractEnd === null ? "text-slate-500 dark:text-slate-400"
                : daysToContractEnd < 0 ? "text-red-600 dark:text-red-400"
                : daysToContractEnd < 30 ? "text-amber-600 dark:text-amber-400"
                : "text-slate-900 dark:text-slate-100"
            }
            sub={tenant.contractEnd ? formatDate(tenant.contractEnd) : "Договор не заключён"}
          />
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          {canCreateInvoice && (
          <Link
            href={`/admin/documents/new/invoice?tenantId=${tenant.id}&period=${currentPeriod}`}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Receipt className="h-3.5 w-3.5" />
            Создать счёт
          </Link>
          )}
          {canRecordPayment && (
          <Link
            href={`/admin/finances?tenantId=${tenant.id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Wallet className="h-3.5 w-3.5" />
            Принять оплату
          </Link>
          )}
          {canCreateDocuments && (
          <>
          <Link
            href={`/admin/documents/new/contract?tenantId=${tenant.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <FileSignature className="h-3.5 w-3.5" />
            Создать договор
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
          </>
          )}
          {canSendMessages && (
          <Link
            href={`/admin/messages?to=${tenant.userId}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Написать
          </Link>
          )}
          <Link
            href={`/admin/requests?tenantId=${tenant.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Заявки
          </Link>
        </div>
      </div>

      <TenantHealthPanel items={tenantHealthItems} primaryAction={tenantPrimaryAction} />

      <TenantLazySectionsProvider
        tenantId={tenant.id}
        legalType={tenant.legalType}
        period={currentPeriod}
        defaultDueDate={defaultServiceDueDate}
      >
      {/* Табы карточки арендатора. Полоса заголовков сверху, контент
          активной — на полную ширину под полосой. CSS-only переключение,
          server component — никаких client boundary проблем. */}
      <Tabs name="tenant-card" defaultActiveId="contact">
          {/* Contact info */}
          <Tab
              id="contact"
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
              <fieldset disabled={!canEditContacts} className="contents">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">ФИО</label>
                <input
                  name="name"
                  defaultValue={tenant.user.name}
                  required
                  autoComplete="name"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Телефон</label>
                <KzPhoneInput
                  name="phone"
                  defaultValue={tenant.user.phone}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Email</label>
                <AsciiEmailInput
                  name="email"
                  defaultValue={tenant.user.email}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <Button
                  type="submit"
                  size="lg"
                  disabled={!canEditContacts}
                  className="font-medium"
                >
                  Сохранить
                </Button>
              </div>
              </fieldset>
            </form>
          </Tab>

          {/* Company info */}
          <Tab
            id="company"
            title="Данные компании"
            icon={Building2}
            meta={`${LEGAL_TYPE_LABELS[tenant.legalType] ?? tenant.legalType} · ${tenant.category ?? "вид деятельности не указан"} · ${tenant.isVatPayer ? `НДС ${tenantVatRate}%` : "без НДС"}`}
          >
            <form
              action={async (formData: FormData) => {
                "use server"
                await updateTenant(tenant.id, formData)
              }}
              className="p-5 grid grid-cols-2 gap-4"
            >
              {/* Эта форма НЕ редактирует bankName/iik/bik/cleaningFee/customRate/
                  fixedMonthlyRent — они в других формах. Убраны вредные hidden-inputs
                  (раньше затирали значения нулём/пустотой при сохранении).
                  Sentinel «isVatPayerForm=1» сообщает action что НДС-чекбокс в этой
                  форме — иначе несохранённая галка не превратится в false. */}
              <input type="hidden" name="isVatPayerForm" value="1" />

              <fieldset disabled={!canEditCompany} className="contents">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Название компании</label>
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
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Вид деятельности</label>
                <input
                  name="category"
                  defaultValue={tenant.category ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      name="isVatPayer"
                      type="checkbox"
                      defaultChecked={tenant.isVatPayer}
                      className="mt-1 rounded border-slate-300"
                    />
                    <span>
                      <span className="block font-medium text-slate-900 dark:text-slate-100">Арендатор — плательщик НДС</span>
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                        Для карточки контрагента, документов и будущего ЭСФ-контура.
                      </span>
                    </span>
                  </label>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Ставка НДС арендатора</label>
                    <select
                      name="vatRate"
                      defaultValue={String(tenantVatRate)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900"
                    >
                      {KZ_VAT_RATE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      Можно выбрать только ставки, предусмотренные НК РК: 0%, 5%, 10% или 16%.
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Юридический адрес</label>
                <AddressAutocompleteInput
                  name="legalAddress"
                  defaultValue={tenant.legalAddress ?? ""}
                  includeStructuredFields={false}
                  placeholder="г. Усть-Каменогорск, ул..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Фактический адрес</label>
                <AddressAutocompleteInput
                  name="actualAddress"
                  defaultValue={tenant.actualAddress ?? ""}
                  includeStructuredFields={false}
                  placeholder="Если совпадает с юридическим — оставьте пустым"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">ФИО руководителя</label>
                <input
                  name="directorName"
                  defaultValue={tenant.directorName ?? ""}
                  placeholder="Иванов Иван Иванович"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Должность руководителя</label>
                <input
                  name="directorPosition"
                  defaultValue={tenant.directorPosition ?? ""}
                  placeholder="Директор / Учредитель"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="col-span-full">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Целевое использование помещения
                </label>
                <input
                  name="usePurpose"
                  defaultValue={tenant.usePurpose ?? ""}
                  placeholder="например: офиса частного судебного исполнителя / розничной торговли / салона красоты"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Подставится в п. 1.1 договора: «для использования в целях <span className="font-mono">размещения [текст]</span>». Если пусто — «по согласованному Сторонами назначению».
                </p>
              </div>
              <div className="col-span-full">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Действует на основании
                </label>
                <input
                  name="basisDocument"
                  defaultValue={tenant.basisDocument ?? ""}
                  placeholder="ИП: Талона №KZ16UWQ03665823 от 01.07.2022 / ТОО: Устава / ЧСИ: лицензии №..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Подставится в шапке договора: «…действующий <span className="font-mono">на основании [текст]</span>».
                  ИП — Талона (Уведомления о начале деятельности), ТОО — Устава, ЧСИ — лицензии. Если пусто — фраза по форме собственности без БИН.
                </p>
              </div>
              {/* Даты договора убраны из карточки арендатора (2026-05-26) —
                  они задаются ТОЛЬКО при создании Договора в /admin/documents/new/contract.
                  Здесь показываем текущие даты как read-only справку. */}
              {(tenant.contractStart || tenant.contractEnd) && (
                <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
                  <p className="mb-1 font-medium text-slate-700 dark:text-slate-200">Текущий период аренды</p>
                  <p>
                    {tenant.contractStart ? new Date(tenant.contractStart).toLocaleDateString("ru-RU") : "—"}
                    {" — "}
                    {tenant.contractEnd ? new Date(tenant.contractEnd).toLocaleDateString("ru-RU") : "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    Даты обновляются при создании нового Договора. Чтобы изменить — создайте новый договор через раздел «Документы».
                  </p>
                </div>
              )}
              <IndexationHint
                initialContractEnd={tenant.contractEnd?.toISOString().slice(0, 10) ?? null}
                initialRate={ratePerSqm}
                monthlyRent={monthlyRent}
              />
              <div className="col-span-2 flex justify-end">
                <Button
                  type="submit"
                  size="lg"
                  disabled={!canEditCompany}
                  className="font-medium"
                >
                  Сохранить
                </Button>
              </div>
              </fieldset>
            </form>
          </Tab>

          {/* Requisites */}
          <Tab
              id="requisites"
              title="Банковские реквизиты"
              icon={CreditCard}
              meta={tenant.bankAccounts.length > 0 ? `${tenant.bankAccounts.length} сч.` : tenant.bankName ?? tenant.iik ?? "не заполнены"}
            >
            {canEditCompany ? (
            <RequisitesFormLoader
              tenantId={tenant.id}
              isIin={tenant.legalType === "IP" || tenant.legalType === "CHSI" || tenant.legalType === "PHYSICAL"}
              initial={{
                bankName: tenant.bankName,
                  iik: tenant.iik,
                  bik: tenant.bik,
                  bin: tenant.bin,
                  iin: tenant.iin,
                  bankAccounts: tenant.bankAccounts,
                }}
              />
            ) : (
              <div className="p-5 text-sm text-slate-500 dark:text-slate-400">
                Реквизиты доступны только для просмотра. Для изменения нужно право на данные компании арендатора.
              </div>
            )}
          </Tab>

          {/* Rental terms */}
          <Tab
            id="rental"
            title="Условия аренды"
            icon={Receipt}
            meta={`${formatMoney(monthlyRent)}/мес`}
          >
            {canEditRentalTerms ? (
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
              }}
            />
            ) : (
              <div className="p-5 text-sm text-slate-500 dark:text-slate-400">
                Условия аренды доступны только для просмотра. Для изменения нужно отдельное право.
              </div>
            )}
          </Tab>

          {/* Service charges */}
          <Tab id="service" title="Доп. начисления" icon={Zap} meta={`за ${currentPeriod}`}>
            <TenantLazyServiceCharges />
          </Tab>

          {/* Начисления, сгруппированные по договорам */}
          <Tab id="charges" title="По договорам" icon={Receipt}>
            <ChargesByContractSection tenantId={tenant.id} orgId={orgId} />
          </Tab>

          {/* Documents actions: invoice, act, contract, handover */}
          {canCreateDocuments && (
            <Tab id="docs-actions" title="Документы клиенту" icon={FileText}>
              <DocumentsActionsLoader
                tenantId={tenant.id}
                tenantHasEmail={!!tenant.user.email}
              />
            </Tab>
          )}

          {/* Email log */}
          <Tab id="email-log" title="Email" icon={Mail}>
            <TenantLazyEmailLog />
          </Tab>

          {/* Documents checklist */}
          <Tab id="docs" title="Документы" icon={FileText}>
            <TenantLazyDocumentsChecklist />
          </Tab>

          {/* История изменений */}
          <Tab id="history" title="История" icon={HistoryIcon}>
            <TenantLazyHistory />
          </Tab>

          {/* === Бывшая правая колонка — теперь часть единого ряда табов === */}
          {/* Full floor assign */}
          {canAssignTenantSpaces && (
            <Tab id="full-floor" title="Целый этаж" icon={Layers}>
              <TenantLazyFullFloor />
            </Tab>
          )}

          {/* Space */}
          <Tab
              id="placement"
              title="Помещения"
              icon={Building2}
              meta={assignedSpaces.length > 0 ? `${assignedSpaces.length}×${assignedSpaces.reduce((sum, space) => sum + space.area, 0)}м²` : myFullFloors.length > 0 ? `${myFullFloors.length} этаж` : "—"}
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
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{space.floor.name}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{space.area} м²</p>
                          </div>
                          {canAssignTenantSpaces && (
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
                          )}
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
                  {canCreateDocuments && (
                  <Link
                    href={`/admin/documents/new/contract?tenantId=${tenant.id}`}
                    className="mt-3 block text-center rounded-lg border border-slate-200 dark:border-slate-800 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-colors"
                  >
                    Сформировать договор
                  </Link>
                  )}
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
                  {canCreateDocuments && (
                  <Link
                    href={`/admin/documents/new/contract?tenantId=${tenant.id}`}
                    className="mt-3 block text-center rounded-lg border border-slate-200 dark:border-slate-800 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    Сформировать договор
                  </Link>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-slate-400 dark:text-slate-500 mb-3">Помещение не назначено</p>
                </div>
              )}
              {canAssignTenantSpaces && (
              <div className={assignedSpaces.length > 0 ? "mt-4 border-t border-slate-100 pt-4 dark:border-slate-800" : ""}>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">
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
                  {vacantSpacesHasMore && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Показаны первые {vacantSpaces.length}. Для точного выбора откройте страницу помещений выбранного здания.
                    </p>
                  )}
                </div>
              </div>
              )}
            </div>
          </Tab>

          <Tab id="contracts" title="Договоры" icon={ShieldCheck}>
            <TenantLazyContractsSidebar />
          </Tab>

          <Tab id="recent" title="Последние начисления" icon={Wallet}>
            <TenantLazyRecentChargesSidebar />
          </Tab>
      </Tabs>
      </TenantLazySectionsProvider>
    </div>
  )
  })
}

function TenantHealthPanel({
  items,
  primaryAction,
}: {
  items: TenantHealthItem[]
  primaryAction: TenantPrimaryAction
}) {
  const issueCount = items.filter((item) => !item.ok).length

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {issueCount === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {issueCount === 0 ? "Карточка арендатора готова" : `Требует внимания: ${issueCount}`}
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Быстрая проверка данных, которые влияют на начисления, документы и связь с арендатором.
          </p>
        </div>
        {primaryAction && (
          <Link
            href={primaryAction.href}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            {primaryAction.label}
          </Link>
        )}
      </div>
      {primaryAction?.description && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {primaryAction.description}
        </p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="rounded-lg border border-slate-200 px-3 py-2 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-slate-800 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{item.label}</span>
              {item.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              )}
            </div>
            <p className={`mt-1 text-sm font-semibold ${item.ok ? "text-slate-900 dark:text-slate-100" : "text-amber-700 dark:text-amber-300"}`}>
              {item.value}
            </p>
          </Link>
        ))}
      </div>
    </section>
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
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-lg font-bold ${valueClass ?? "text-slate-900 dark:text-slate-100"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}
