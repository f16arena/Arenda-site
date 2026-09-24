// force-dynamic чтобы после updateTenant новый рендер сразу видел свежие данные
// без 60-секундной задержки кэша Next.js (см. AUDIT_2026-05-26.md).
export const dynamic = "force-dynamic"

import { ActionMenu } from "@/components/ui/action-menu"
import { assertTenantBuildingAccess } from "@/lib/building-access"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import { additionalChargesEnabled } from "@/lib/org-features"
import { assertBuildingInOrg, assertTenantInOrg } from "@/lib/scope-guards"
import { getCurrentBuildingId } from "@/lib/current-building"
import { spaceScope } from "@/lib/tenant-scope"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import {
  updateTenantUser,
  assignTenantSpace,
  unassignTenantSpace,
} from "@/app/actions/tenant"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatDateL, formatMoneyL } from "@/lib/i18n/format"
import type { Translator } from "@/lib/i18n/translate"
import type { Messages } from "@/lib/i18n/messages"
import {
  ArrowLeft, Building2, User, CreditCard, FileText, Receipt,
  Wallet, TrendingDown, ClipboardList, MessageSquare, Zap,
  FileSignature, CheckCircle2, AlertTriangle,
  History as HistoryIcon, ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { DeleteTenantButton } from "../delete-tenant-button"
import { BlacklistButton } from "./blacklist-button"
import { PaymentReminderButton } from "./payment-reminder-button"
import { TenantNotes } from "./tenant-notes"
import { RenewContractButton } from "./renew-contract-button"
import { ServiceFeeExemptToggle } from "./service-fee-exempt-toggle"
import {
  DocumentsActionsLoader,
  RentalTermsFormLoader,
  RequisitesFormLoader,
} from "./client-section-loaders"
import { calculateTenantMonthlyRent, calculateTenantRatePerSqm, hasFixedTenantRent } from "@/lib/rent"
import { computeDepositStatus } from "@/lib/deposit"
import { getTenantAreaTotal, getTenantPrimaryBuildingId } from "@/lib/tenant-placement"
import { AsciiEmailInput, KzPhoneInput } from "@/components/forms/contact-inputs"
import { ExternalContractButton } from "./external-contract-button"
import { CompanyForm } from "./company-form"
import { Tabs, Tab } from "@/components/ui/server-tabs"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { Prisma } from "@/app/generated/prisma/client"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import { coerceKzVatRate, DEFAULT_KZ_VAT_RATE } from "@/lib/kz-vat"
import { safeServerValue } from "@/lib/server-fallback"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import {
  TenantLazyContractsSidebar,
  TenantLazyDocumentsChecklist,
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

/** Название правовой формы: ключи adminTenants.legalTypes, иначе — код как есть. */
function legalTypeLabel(t: Translator<Messages>["t"], legalType: string): string {
  const key = `adminTenants.legalTypes.${legalType}` as Parameters<Translator<Messages>["t"]>[0]
  const label = t(key)
  return label === key ? legalType : label
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return measureServerRoute("/admin/tenants/[id]", async () => {
  const locale = await getLocale()
  const { t, tp } = await getT(locale)
  const money = (amount: number) => formatMoneyL(locale, amount)
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
  const canSignDocuments = allowedCapabilities.has("documents.sign")
  const canCreateAddendum = allowedCapabilities.has("documents.addendum")
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

  const orgFeaturesRow = await safe(
    "admin.tenant.orgFeatures",
    db.organization.findUnique({ where: { id: orgId }, select: { features: true } }),
    null,
  )
  const showAdditionalCharges = additionalChargesEnabled(orgFeaturesRow?.features)

  const { id } = await params
  try {
    await assertTenantInOrg(id, orgId)
    await assertTenantBuildingAccess(id, orgId)
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
      serviceFeeExempt: true,
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
      idDocNumber: true,
      idDocIssuedBy: true,
      idDocIssuedAt: true,
      idDocExpiresAt: true,
      esfEnabled: true,
      rentFreeMonths: true,
      depositAmount: true,
      internalNotes: true,
      indexationPct: true,
      nextIndexationAt: true,
      moveInDate: true,
      cleaningFee: true,
      needsCleaning: true,
      customRate: true,
      fixedMonthlyRent: true,
      rentSchedule: true,
      paymentDueDay: true,
      penaltyPercent: true,
      isVatPayer: true,
      vatRate: true,
      vatStatus: true,
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

  // Период аренды берётся из АКТИВНОГО Договора (Contract), а не из
  // tenant.contractStart/End (которые исторически могли быть введены вручную
  // при создании тенанта без реального договора). Если контракта нет —
  // показываем «Договор не создан» (требование владельца 2026-05-27).
  const activeContract = await db.contract.findFirst({
    where: {
      tenantId: id,
      status: { in: ["SIGNED", "DRAFT", "SIGNED_BY_TENANT", "SENT", "ACTIVE"] },
      type: { not: "ADDENDUM" },
    },
    select: { id: true, startDate: true, endDate: true, status: true, number: true },
    orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
  }).catch(() => null)

  const today = new Date()
  // Дни до окончания договора (отрицательное = истёк). null = договор не создан.
  const effectiveContractEnd = activeContract?.endDate ?? null
  const daysToContractEnd = effectiveContractEnd
    ? Math.ceil((effectiveContractEnd.getTime() - today.getTime()) / 86_400_000)
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

  const [vacantSpacesPreview, debtAgg, depositCharges, creditAgg] = await measureServerStep("/admin/tenants/[id]", "assignable-spaces-and-debt", Promise.all([
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
    safe(
      "tenantDetail.depositCharges",
      db.charge.findMany({
        where: { tenantId: tenant.id, type: { in: ["DEPOSIT", "DEPOSIT_REFUND"] }, deletedAt: null },
        select: { type: true, amount: true, isPaid: true },
      }),
      [] as { type: string; amount: number; isPaid: boolean }[],
    ),
    safe(
      "tenantDetail.creditAggregate",
      // Аванс (переплата): нераспределённые остатки платежей.
      db.payment.aggregate({
        where: { tenantId: tenant.id, deletedAt: null, unappliedAmount: { gt: 0 } },
        _sum: { unappliedAmount: true },
      }),
      { _sum: { unappliedAmount: 0 } },
    ),
  ]))

  const vacantSpacesHasMore = vacantSpacesPreview.length > 50
  const vacantSpaces = vacantSpacesPreview.slice(0, 50)
  const signedContractsCount = tenant._count.contracts
  const totalDebt = debtAgg._sum.amount ?? 0
  const debtCount = debtAgg._count._all ?? 0
  const tenantCredit = Math.round((creditAgg._sum.unappliedAmount ?? 0) * 100) / 100

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
    ? t("adminTenants.card.rental.lockReasonFloors", {
        floors: fullFloorsWithFixedRent.map((floor) => floor.name).join(", "),
        amount: money(fullFloorRentTotal),
      })
    : hasTenantFixedRent
      ? t("adminTenants.card.rental.lockReasonFixed", { amount: money(tenant.fixedMonthlyRent ?? 0) })
      : hasTenantCustomRate
        ? t("adminTenants.card.rental.lockReasonRate", { amount: money(tenant.customRate ?? 0) })
        : null
  const hasPlacement = assignedSpaces.length > 0 || myFullFloors.length > 0
  const hasContact = Boolean((tenant.user.phone ?? "").trim() || (tenant.user.email ?? "").trim())
  const hasBankDetails = tenant.bankAccounts.length > 0 || Boolean((tenant.bankName ?? "").trim() && (tenant.iik ?? "").trim() && (tenant.bik ?? "").trim())
  const hasSignedContract = signedContractsCount > 0
  /**
   * Состояние договора одной фразой. Раньше карточка одновременно показывала
   * «Договор до 19 сентября 2027» и «нет подписанного договора», а кнопка
   * предлагала создать ещё один — хотя договор уже отправлен и ждёт подписи
   * арендатора. Теперь видно, на каком он шаге.
   */
  const contractState: { value: string; ok: boolean; action: TenantPrimaryAction | null } = hasSignedContract
    ? { value: t("adminTenants.card.contractState.signed"), ok: true, action: null }
    : activeContract
      ? activeContract.status === "SENT"
        ? {
            value: t("adminTenants.card.contractState.waitingTenant", { number: activeContract.number ?? "" }),
            ok: false,
            action: {
              label: t("adminTenants.card.contractState.openContract"),
              description: t("adminTenants.card.contractState.openContractHint", { number: activeContract.number ?? "" }),
              href: "/admin/documents",
            },
          }
        : activeContract.status === "SIGNED_BY_TENANT"
          ? {
              value: t("adminTenants.card.contractState.waitingYou", { number: activeContract.number ?? "" }),
              ok: false,
              action: {
                label: t("adminTenants.card.contractState.signContract"),
                description: t("adminTenants.card.contractState.signContractHint", { number: activeContract.number ?? "" }),
                href: "/admin/documents",
              },
            }
          : {
              value: t("adminTenants.card.contractState.draft", { number: activeContract.number ?? "" }),
              ok: false,
              action: {
                label: t("adminTenants.card.contractState.finishContract"),
                description: t("adminTenants.card.contractState.finishContractHint", { number: activeContract.number ?? "" }),
                href: "/admin/documents",
              },
            }
      : {
          value: t("adminTenants.card.contractState.none"),
          ok: false,
          action: {
            label: t("adminTenants.card.contractState.createContract"),
            description: t("adminTenants.card.contractState.createContractHint"),
            href: `/admin/documents?create=contract&tenantId=${tenant.id}`,
          },
        }
  // Депозит: требуемая сумма (0 = отключён, null = 1 мес. аренды) против оплаченных
  // DEPOSIT-начислений за вычетом возвратов (DEPOSIT_REFUND).
  const depositRequired = tenant.depositAmount === 0 ? 0 : (tenant.depositAmount ?? monthlyRent)
  const depositHeld = depositCharges.reduce((sum, c) => {
    if (c.type === "DEPOSIT_REFUND") return sum - c.amount
    return c.isPaid ? sum + c.amount : sum
  }, 0)
  const depositStatus = computeDepositStatus({
    required: depositRequired,
    held: depositHeld,
    hasUnpaid: depositCharges.some((c) => c.type === "DEPOSIT" && !c.isPaid && c.amount > 0),
    hasAnyCharge: depositCharges.length > 0,
    hasRefund: depositCharges.some((c) => c.type === "DEPOSIT_REFUND"),
  })
  const depositOk = depositStatus === "PAID" || depositStatus === "NOT_REQUIRED" || depositStatus === "RETURNED"
  // Неоплаченный депозит входит в «долг» — подписываем его долю явно (аудит 2026-06-10, п.6а).
  const unpaidDepositAmount = depositCharges
    .filter((c) => c.type === "DEPOSIT" && !c.isPaid)
    .reduce((sum, c) => sum + c.amount, 0)
  // Статус депозита: подписи в adminTenants.depositStatuses (ключи lib/deposit).
  const depositStatusKey = `adminTenants.depositStatuses.${depositStatus}` as Parameters<typeof t>[0]
  const tenantHealthItems: TenantHealthItem[] = [
    {
      label: t("adminTenants.card.health.debt"),
      value: totalDebt > 0 ? money(totalDebt) : t("adminTenants.card.health.debtNone"),
      ok: totalDebt <= 0,
      href: `/admin/finances?tenantId=${tenant.id}`,
    },
    {
      label: t("adminTenants.card.health.contract"),
      value: contractState.value,
      ok: contractState.ok,
      href: contractState.action?.href ?? "/admin/documents",
    },
    {
      label: t("adminTenants.card.health.deposit"),
      value: t(depositStatusKey).toLowerCase(),
      ok: depositOk,
      href: "/admin/finances/deposits",
    },
    {
      label: t("adminTenants.card.health.space"),
      value: hasPlacement ? t("adminTenants.card.health.spaceOk") : t("adminTenants.card.health.spaceNo"),
      ok: hasPlacement,
      href: "#tenant-placement",
    },
    {
      label: t("adminTenants.card.health.contacts"),
      value: hasContact ? t("adminTenants.card.health.filled") : t("adminTenants.card.health.notFilled"),
      ok: hasContact,
      href: "#tenant-contact",
    },
    {
      label: t("adminTenants.card.health.requisites"),
      value: hasBankDetails ? t("adminTenants.card.health.filled") : t("adminTenants.card.health.notFilled"),
      ok: hasBankDetails,
      href: "#tenant-requisites",
    },
  ]
  const tenantPrimaryAction: TenantPrimaryAction = totalDebt > 0
    ? {
        label: t("adminTenants.card.primaryAction.checkDebt"),
        description: t("adminTenants.card.primaryAction.checkDebtHint", { amount: money(totalDebt) }),
        href: `/admin/finances?tenantId=${tenant.id}`,
      }
    : !hasPlacement
      ? {
          label: t("adminTenants.card.primaryAction.assignSpace"),
          description: t("adminTenants.card.primaryAction.assignSpaceHint"),
          href: "#tenant-placement",
        }
      : contractState.action
        ? contractState.action
        : !hasBankDetails
          ? {
              label: t("adminTenants.card.primaryAction.fillRequisites"),
              description: t("adminTenants.card.primaryAction.fillRequisitesHint"),
              href: "#tenant-requisites",
            }
          : !hasContact
            ? {
                label: t("adminTenants.card.primaryAction.fillContacts"),
                description: t("adminTenants.card.primaryAction.fillContactsHint"),
                href: "#tenant-contact",
              }
            : null

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t("adminTenants.card.home"), href: "/admin" },
          { label: t("adminTenants.card.tenants"), href: "/admin/tenants" },
          { label: tenant.companyName },
        ]}
      />
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/tenants"
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("common.actions.back")}
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">{tenant.companyName}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {legalTypeLabel(t, tenant.legalType)}
            {tenant.category ? ` · ${tenant.category}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateAddendum && activeContract?.status === "SIGNED" && (
            <RenewContractButton
              contractId={activeContract.id}
              contractNumber={activeContract.number}
              currentEnd={activeContract.endDate?.toISOString().slice(0, 10) ?? null}
            />
          )}
          {canSendMessages && totalDebt > 0 && <PaymentReminderButton tenantId={tenant.id} />}
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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-2 space-y-5 lg:order-1">
      <TenantLazySectionsProvider
        tenantId={tenant.id}
        legalType={tenant.legalType}
        period={currentPeriod}
        defaultDueDate={defaultServiceDueDate}
        canSignDocuments={canSignDocuments}
      >
      {/* Табы карточки арендатора. Полоса заголовков сверху, контент
          активной — на полную ширину под полосой. CSS-only переключение,
          server component — никаких client boundary проблем. */}
      <Tabs name="tenant-card" defaultActiveId="contact">
          {/* Contact info */}
          <Tab
              id="contact"
              title={t("adminTenants.card.tabs.contact")}
              icon={User}
              meta={tenant.user.phone ?? tenant.user.email ?? t("adminTenants.card.tabs.contactEmpty")}
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
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.card.contactForm.fullName")}</label>
                <Input
                  name="name"
                  defaultValue={tenant.user.name}
                  required
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.card.contactForm.phone")}</label>
                <KzPhoneInput
                  name="phone"
                  defaultValue={tenant.user.phone}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.card.contactForm.email")}</label>
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
                  {t("common.actions.save")}
                </Button>
              </div>
              </fieldset>
            </form>
          </Tab>

          {/* Company info */}
          <Tab
            id="company"
            title={t("adminTenants.card.tabs.company")}
            icon={Building2}
            meta={[
              legalTypeLabel(t, tenant.legalType),
              tenant.category ?? t("adminTenants.card.tabs.companyNoCategory"),
              tenant.isVatPayer
                ? t("adminTenants.card.tabs.companyVat", { rate: tenantVatRate })
                : t("adminTenants.card.tabs.companyNoVat"),
            ].join(" · ")}
          >
            {/* Форма вынесена в company-form.tsx (perf-gate: страница < 55 КБ) */}
            <CompanyForm
              tenant={tenant}
              canEditCompany={canEditCompany}
              tenantVatRate={tenantVatRate}
              activeContract={activeContract}
              ratePerSqm={ratePerSqm}
              monthlyRent={monthlyRent}
            />

            {/* === Объединено 2026-05-27: Банковские реквизиты теперь
                раздел внутри «Данные компании» === */}
            <div className="border-t border-slate-100 dark:border-slate-800">
              <div className="px-5 pt-5 pb-2 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminTenants.card.bankAccounts.title")}</h3>
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
                  {tenant.bankAccounts.length > 0
                    ? t("adminTenants.card.bankAccounts.count", { count: tenant.bankAccounts.length })
                    : t("adminTenants.card.bankAccounts.empty")}
                </span>
              </div>
              {canEditCompany ? (
                <RequisitesFormLoader
                  tenantId={tenant.id}
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
                  {t("adminTenants.card.bankAccounts.readOnly")}
                </div>
              )}
            </div>

            {/* Сканы устава, удостоверения и реквизитов — свой заголовок у блока. */}
            <div className="border-t border-slate-100 p-5 dark:border-slate-800">
              <TenantLazyDocumentsChecklist />
            </div>
          </Tab>

          {/* === Объединено 2026-05-27: «Аренда» = Условия + Целый этаж + Помещения === */}
          <Tab
            id="rental"
            title={t("adminTenants.card.tabs.rental")}
            icon={Receipt}
            meta={`${money(monthlyRent)}${t("common.money.perMonth")} · ${
              assignedSpaces.length > 0
                ? t("adminTenants.card.tabs.rentalSpaces", { count: assignedSpaces.length })
                : myFullFloors.length > 0
                  ? t("adminTenants.card.tabs.rentalFloors", { count: myFullFloors.length })
                  : "—"
            }`}
          >
            <div className="px-5 pt-5 pb-2 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminTenants.card.rental.termsTitle")}</h3>
            </div>
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
                  rentFreeMonths: tenant.rentFreeMonths ?? 0,
                  depositAmount: tenant.depositAmount,
                  moveInDate: tenant.moveInDate?.toISOString().slice(0, 10) ?? null,
                  indexationPct: tenant.indexationPct,
                  nextIndexationAt: tenant.nextIndexationAt?.toISOString().slice(0, 10) ?? null,
                  rentSchedule: tenant.rentSchedule,
                }}
              />
            ) : (
              <div className="p-5 text-sm text-slate-500 dark:text-slate-400">
                {t("adminTenants.card.rental.termsReadOnly")}
              </div>
            )}

            {/* Исключение из эксплуатационного сбора — независимо от блокировки
                условий договором (это биллинговый флаг, а не условие аренды). */}
            <ServiceFeeExemptToggle
              tenantId={tenant.id}
              exempt={tenant.serviceFeeExempt}
              disabled={!canEditRentalTerms}
            />

            {canAssignTenantSpaces && (
              <div className="border-t border-slate-100 p-5 dark:border-slate-800">
                <TenantLazyFullFloor />
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-slate-800">
              <div className="px-5 pt-5 pb-2 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminTenants.card.rental.spacesTitle")}</h3>
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
                  {assignedSpaces.length > 0
                    ? t("adminTenants.card.rental.spacesMeta", {
                        count: assignedSpaces.length,
                        area: assignedSpaces.reduce((sum, space) => sum + space.area, 0),
                      })
                    : t("adminTenants.card.rental.spacesEmpty")}
                </span>
              </div>
              <div className="p-4">
                {assignedSpaces.length > 0 ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {assignedSpaces.map((space, index) => (
                        <div key={space.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                {t("adminTenants.table.spaceLabel", { number: space.number })}
                                {index === 0 && (
                                  <span className="ml-2 align-middle rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                                    {t("adminTenants.card.rental.primary")}
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
                                  {t("adminTenants.card.rental.unassign")}
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {hasTenantFixedRent ? (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {t("adminTenants.card.rental.fixedAmount", { amount: money(tenant.fixedMonthlyRent ?? 0) })}
                      </p>
                    ) : tenant.customRate ? (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {t("adminTenants.card.rental.customRate", { amount: money(tenant.customRate) })}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("adminTenants.card.rental.byFloorRate")}</p>
                    )}
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-2">
                      {t("adminTenants.card.rental.rentTotal", { amount: money(monthlyRent) })}
                    </p>
                    {canCreateDocuments && (
                      <Link
                        href={`/admin/documents?create=contract&tenantId=${tenant.id}`}
                        className="mt-3 block text-center rounded-lg border border-slate-200 dark:border-slate-800 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        {t("adminTenants.card.rental.makeContract")}
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
                            {money(floor.fixedMonthlyRent ?? 0)}{t("common.money.perMonth")}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-2">
                      {t("adminTenants.card.rental.rentAll", { amount: money(monthlyRent) })}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500 mb-3">{t("adminTenants.card.rental.notAssigned")}</p>
                )}
                {canAssignTenantSpaces && (
                  <div className={assignedSpaces.length > 0 ? "mt-4 border-t border-slate-100 pt-4 dark:border-slate-800" : ""}>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">
                      {assignedSpaces.length > 0 ? t("adminTenants.card.rental.addMore") : t("adminTenants.card.rental.vacant")}
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
                            className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                          >
                            <span className="font-medium">{t("adminTenants.table.spaceLabel", { number: s.number })}</span>
                            <span className="text-slate-400 dark:text-slate-500 ml-1">· {s.floor.name} · {s.area} м²</span>
                          </button>
                        </form>
                      ))}
                      {vacantSpaces.length === 0 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">{t("adminTenants.card.rental.noVacant")}</p>
                      )}
                      {vacantSpacesHasMore && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {t("adminTenants.card.rental.vacantTruncated", { count: vacantSpaces.length })}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Tab>

          {/* === Объединение «Договоры» 2026-05-27: список договоров +
              действия (создать счёт/договор/АВР) + начисления по договорам.
              Раньше 3 отдельных таба — теперь один с 3 секциями. === */}
          <Tab id="contracts" title={t("adminTenants.card.tabs.contracts")} icon={ShieldCheck}>
            {/* У каждой карточки свой заголовок — внешние сняты, иначе
                «Список договоров → Договоры» читалось как два разных блока. */}
            <div className="space-y-4 p-5">
              <TenantLazyContractsSidebar />

              {canCreateDocuments && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {t("adminTenants.card.contracts.externalHint")}
                    </p>
                    <ExternalContractButton tenantId={tenant.id} />
                  </div>
                  <DocumentsActionsLoader
                    tenantId={tenant.id}
                    tenantHasEmail={!!tenant.user.email}
                  />
                </>
              )}

              <ChargesByContractSection tenantId={tenant.id} orgId={orgId} />
            </div>
          </Tab>

          {/* === Объединение «Начисления» 2026-05-27: доп. начисления (свет/вода)
              + последние начисления (cron-сводка). === */}
          <Tab
            id="charges-all"
            title={t("adminTenants.card.tabs.charges")}
            icon={Zap}
            meta={t("adminTenants.card.tabs.chargesMeta", { period: currentPeriod })}
          >
            <div className="space-y-4 p-5">
              {showAdditionalCharges && <TenantLazyServiceCharges />}
              <TenantLazyRecentChargesSidebar />
            </div>
          </Tab>

          {/* История изменений */}
          <Tab id="history" title={t("adminTenants.card.tabs.history")} icon={HistoryIcon}>
            <TenantLazyHistory />
          </Tab>
      </Tabs>
      </TenantLazySectionsProvider>
      </div>

      {/* Справа — коротко о главном, что сделать, действия и заметки */}
      <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-20">
        <Card className="block p-0">
          <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            <div className="flex items-baseline justify-between gap-3 px-4 py-3">
              <dt className="text-slate-500 dark:text-slate-400">{t("adminTenants.card.summary.debt")}</dt>
              <dd className={`text-right font-semibold ${totalDebt > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {totalDebt > 0 ? money(totalDebt) : t("adminTenants.card.summary.noDebt")}
                {totalDebt > 0 && (
                  <span className="block text-xs font-normal text-slate-400 dark:text-slate-500">
                    {tp("adminTenants.card.summary.debtCharges", debtCount)}
                    {unpaidDepositAmount > 0
                      ? t("adminTenants.card.summary.debtDeposit", { amount: money(unpaidDepositAmount) })
                      : ""}
                  </span>
                )}
                {tenantCredit > 0 && (
                  <span className="block text-xs font-normal text-slate-400 dark:text-slate-500">
                    {t("adminTenants.card.summary.credit", { amount: money(tenantCredit) })}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-4 py-3">
              <dt className="text-slate-500 dark:text-slate-400">{t("adminTenants.card.summary.rent")}</dt>
              <dd className="text-right font-semibold text-slate-900 dark:text-slate-100">{money(monthlyRent)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-4 py-3">
              <dt className="text-slate-500 dark:text-slate-400">{t("adminTenants.card.summary.space")}</dt>
              <dd className="min-w-0 text-right font-medium text-slate-900 dark:text-slate-100">
                {assignedSpaces.length > 1
                  ? t("adminTenants.card.summary.spaces", { count: assignedSpaces.length })
                  : assignedSpaces[0]
                    ? t("adminTenants.card.summary.spaceNumber", { number: assignedSpaces[0].number })
                    : myFullFloors.length > 1
                      ? t("adminTenants.card.summary.floors", { count: myFullFloors.length })
                      : myFullFloors[0]
                        ? myFullFloors[0].name
                        : t("adminTenants.card.summary.notAssigned")}
                <span className="block text-xs font-normal text-slate-400 dark:text-slate-500">
                  {assignedSpaces.length > 0
                    ? `${assignedSpaces.reduce((sum, space) => sum + space.area, 0)} м²`
                    : myFullFloors.length > 0
                      ? `${fullFloorArea} м²`
                      : ""}
                </span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-4 py-3">
              <dt className="text-slate-500 dark:text-slate-400">{t("adminTenants.card.summary.contractEnd")}</dt>
              <dd className="text-right font-medium text-slate-900 dark:text-slate-100">
                {effectiveContractEnd ? formatDateL(locale, effectiveContractEnd) : t("adminTenants.card.summary.noContract")}
                {daysToContractEnd !== null && (
                  <span className={`block text-xs font-normal ${daysToContractEnd < 0 ? "text-red-500" : daysToContractEnd < 30 ? "text-amber-500" : "text-slate-400 dark:text-slate-500"}`}>
                    {daysToContractEnd < 0
                      ? t("adminTenants.card.summary.expired")
                      : tp("adminTenants.card.summary.daysLeft", daysToContractEnd)}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <TenantHealthPanel items={tenantHealthItems} primaryAction={tenantPrimaryAction} t={t} />

        <Card title={t("adminTenants.card.actions.title")} className="block">
          <div className="flex flex-col gap-2">
            {canCreateInvoice && (
              <Link href={`/admin/documents?create=invoice&tenantId=${tenant.id}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                <Receipt className="h-4 w-4" /> {t("adminTenants.card.actions.createInvoice")}
              </Link>
            )}
            {canRecordPayment && (
              <Link href={`/admin/finances?tenantId=${tenant.id}`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                <Wallet className="h-4 w-4" /> {t("adminTenants.card.actions.recordPayment")}
              </Link>
            )}
            <ActionMenu
              label={t("adminTenants.card.actions.more")}
              tone="outline"
              align="start"
              width="w-64"
              items={[
                ...(canCreateDocuments ? [
                  { label: t("adminTenants.card.actions.createContract"), icon: <FileSignature className="h-4 w-4 text-slate-400" />, href: `/admin/documents?create=contract&tenantId=${tenant.id}` },
                  { label: t("adminTenants.card.actions.avr"), icon: <FileText className="h-4 w-4 text-slate-400" />, href: `/admin/documents?create=avr&tenantId=${tenant.id}` },
                  { label: t("adminTenants.card.actions.reconciliation"), icon: <TrendingDown className="h-4 w-4 text-slate-400" />, href: `/admin/documents?create=reconciliation&tenantId=${tenant.id}` },
                ] : []),
                ...(canSendMessages ? [{ label: t("adminTenants.card.actions.message"), icon: <MessageSquare className="h-4 w-4 text-slate-400" />, href: `/admin/messages?to=${tenant.userId}`, separatorBefore: true }] : []),
                { label: t("adminTenants.card.actions.requests"), icon: <ClipboardList className="h-4 w-4 text-slate-400" />, href: `/admin/requests?tenantId=${tenant.id}` },
              ]}
            />
          </div>
        </Card>

        <TenantNotes tenantId={tenant.id} initial={tenant.internalNotes ?? ""} />
      </aside>
      </div>
    </div>
  )
  })
}

// Сводка проблем карточки — в правой колонке. Показываем только то, что
// мешает работать: зелёные «всё в порядке» не занимают место.
function TenantHealthPanel({
  items,
  primaryAction,
  t,
}: {
  items: TenantHealthItem[]
  primaryAction: TenantPrimaryAction
  t: Translator<Messages>["t"]
}) {
  const issues = items.filter((item) => !item.ok)

  if (issues.length === 0 && !primaryAction) {
    return (
      <Card className="block p-4">
        <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> {t("adminTenants.card.health.allGood")}
        </p>
      </Card>
    )
  }

  return (
    <Card className="block p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        {issues.length > 0
          ? t("adminTenants.card.health.needsAttention", { count: issues.length })
          : t("adminTenants.card.health.nextStep")}
      </p>
      {primaryAction?.description && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{primaryAction.description}</p>
      )}
      {issues.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {issues.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span className="text-slate-500 dark:text-slate-400">{item.label}</span>
                <span className="text-right font-medium text-amber-700 dark:text-amber-300">{item.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {primaryAction && (
        <Link
          href={primaryAction.href}
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {primaryAction.label}
        </Link>
      )}
    </Card>
  )
}

