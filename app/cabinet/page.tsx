export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import {
  CreditCard, FileText, ClipboardList, Building2, Calendar,
  AlertCircle, MessageSquare, Download, ArrowRight, Receipt,
  Wallet, FileSignature, CircleHelp, Camera,
} from "lucide-react"
import Link from "next/link"
import { PaymentsMiniCalendarLoader } from "./payments-mini-calendar-loader"
import { safeServerValue } from "@/lib/server-fallback"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import { formatPersonShortName } from "@/lib/display-name"
import { Card } from "@/components/ui/page"
import type { Locale } from "@/lib/i18n/config"

export default async function CabinetDashboard() {
  return measureServerRoute("/cabinet", async () => {
  const session = await auth()
  const locale = await getLocale()
  const { t, tp } = await getT(locale)
  const money = (amount: number) => formatMoneyL(locale, amount)
  const day = (value: Date | string) => formatDateShortL(locale, value)
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, {
      source,
      route: "/cabinet",
      orgId: session?.user.organizationId,
      userId: session?.user.id,
    })

  const tenant = await db.tenant.findUnique({
    where: { userId: session!.user.id },
    include: {
      space: { include: { floor: true } },
      // Этаж целиком — без него аренда в кабинете считалась как 0.
      fullFloors: { select: { fixedMonthlyRent: true } },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { space: { include: { floor: true } } },
      },
      charges: {
        where: { deletedAt: null, isPaid: false },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 8,
      },
      payments: {
        where: { deletedAt: null },
        orderBy: { paymentDate: "desc" },
        take: 3,
      },
      paymentReports: {
        where: { status: { in: ["PENDING", "DISPUTED"] } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, amount: true, status: true, createdAt: true },
      },
      contracts: {
        where: { status: { in: ["SENT", "VIEWED", "SIGNED_BY_TENANT"] } },
        orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
        take: 3,
        select: { id: true, number: true, type: true, status: true, signToken: true, sentAt: true },
      },
    },
  })

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-400">{t("cabinetHome.noTenant.title")}</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{t("cabinetHome.noTenant.hint")}</p>
        </div>
      </div>
    )
  }

  const today = new Date()
  const currentPeriod = today.toISOString().slice(0, 7)
  const [debtAgg, overdueAgg, activeRequestsCount] = await measureServerStep("/cabinet", "money-summary", Promise.all([
    safe(
      "cabinet.dashboard.debtAggregate",
      db.charge.aggregate({
        where: { tenantId: tenant.id, isPaid: false },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: tenant.charges.length } },
    ),
    safe(
      "cabinet.dashboard.overdueAggregate",
      db.charge.aggregate({
        where: { tenantId: tenant.id, isPaid: false, dueDate: { lt: today } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe(
      "cabinet.dashboard.activeRequestsCount",
      db.request.count({
        where: { tenantId: tenant.id, status: { in: ["NEW", "IN_PROGRESS"] } },
      }),
      0,
    ),
  ]))
  const totalDebt = debtAgg._sum.amount ?? 0
  const debtCount = debtAgg._count._all ?? tenant.charges.length
  const nextCharge = tenant.charges[0]
  const daysToContractEnd = tenant.contractEnd
    ? Math.ceil((tenant.contractEnd.getTime() - today.getTime()) / 86_400_000)
    : null

  const overdueTotal = overdueAgg._sum.amount ?? 0
  const assignedSpaces = tenant.tenantSpaces.length > 0
    ? tenant.tenantSpaces.map((item) => item.space)
    : tenant.space ? [tenant.space] : []
  const primarySpace = assignedSpaces[0] ?? null

  // Здание показываем только из организации арендатора
  const [building, recentDocs, unreadMessages, recentMessages, landlord] = await measureServerStep("/cabinet", "supporting-widgets", Promise.all([
    db.building.findFirst({
      where: {
        ...(primarySpace?.floor.buildingId ? { id: primarySpace.floor.buildingId } : {}),
        isActive: true,
        organizationId: session!.user.organizationId ?? "__none__",
      },
    }),
    safe(
      "cabinet.dashboard.recentDocs",
      db.generatedDocument.findMany({
        where: { tenantId: tenant.id },
        orderBy: { generatedAt: "desc" },
        take: 5,
        select: {
          id: true, number: true, documentType: true,
          period: true, totalAmount: true, generatedAt: true, fileName: true,
        },
      }),
      [],
    ),
    safe(
      "cabinet.dashboard.unreadMessages",
      db.message.count({
        where: { toId: session!.user.id, isRead: false },
      }),
      0,
    ),
    safe(
      "cabinet.dashboard.recentMessages",
      db.message.findMany({
        where: { toId: session!.user.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true, subject: true, body: true, isRead: true, createdAt: true,
          from: { select: { name: true } },
        },
      }),
      [],
    ),
    session!.user.organizationId
      ? safe("cabinet.dashboard.landlordRequisites", getOrganizationRequisites(session!.user.organizationId), null)
      : Promise.resolve(null),
  ]))
  const primaryBankAccount = landlord?.bankAccounts[0] ?? null
  const paymentPurpose = t("cabinetHome.payCard.purposeValue", { company: tenant.companyName, period: currentPeriod })
  const pendingContracts = tenant.contracts
  const pendingPaymentReports = tenant.paymentReports
  const tenantMustSignCount = pendingContracts.filter((contract) => (
    (contract.status === "SENT" || contract.status === "VIEWED") && !!contract.signToken
  )).length

  // Выставленные АВР/акты сверки, которые арендатор ещё не подписал.
  const signableDocs = await safe(
    "cabinet.dashboard.signableDocs",
    db.generatedDocument.findMany({
      where: { tenantId: tenant.id, deletedAt: null, documentType: { in: ["ACT", "RECONCILIATION"] } },
      select: { id: true, documentType: true, number: true },
    }),
    [] as Array<{ id: string; documentType: string; number: string | null }>,
  )
  const signedDocIds = new Set(
    (await safe(
      "cabinet.dashboard.signedDocs",
      db.documentSignature.findMany({
        where: { documentType: { in: ["ACT", "RECONCILIATION"] }, documentId: { in: signableDocs.map((d) => d.id) }, signerUserId: session!.user.id },
        select: { documentId: true },
      }),
      [] as Array<{ documentId: string | null }>,
    )).map((s) => s.documentId),
  )
  const pendingSignDocs = signableDocs.filter((d) => !signedDocIds.has(d.id))

  const docTypeLabel = (type: string) =>
    type === "INVOICE" ? t("domain.docTypes.INVOICE")
    : type === "ACT" ? t("domain.docTypes.ACT")
    : type === "RECONCILIATION" ? t("domain.docTypes.RECONCILIATION")
    : type === "HANDOVER" ? t("domain.docTypes.HANDOVER")
    : type === "CONTRACT" ? t("domain.docTypes.CONTRACT")
    : type

  const chargeTypeLabel = (type: string) => {
    const key = `domain.chargeTypes.${type}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? type : label
  }

  return (
    <div className="space-y-5 pb-20 sm:space-y-6 sm:pb-0">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">
          {t("cabinetHome.greeting", { name: formatPersonShortName(session?.user.name) })}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {tenant.companyName}{building?.name ? ` · ${building.name}` : ""}
        </p>
      </div>

      {/* Главная карточка состояния */}
      <div className={`rounded-2xl p-6 ${
        overdueTotal > 0
          ? "bg-gradient-to-br from-red-50 to-red-100 dark:from-red-500/10 dark:to-red-500/5 border border-red-200 dark:border-red-500/30"
          : totalDebt > 0
            ? "bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-500/10 dark:to-amber-500/5 border border-amber-200 dark:border-amber-500/30"
            : "bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-500/10 dark:to-emerald-500/5 border border-emerald-200 dark:border-emerald-500/30"
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              {overdueTotal > 0
                ? t("cabinetHome.balance.overdueLabel")
                : totalDebt > 0 ? t("cabinetHome.balance.dueLabel") : t("cabinetHome.balance.okLabel")}
            </p>
            <p className={`text-3xl md:text-4xl font-bold mt-2 ${
              overdueTotal > 0 ? "text-red-700 dark:text-red-300" : totalDebt > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
            }`}>
              {totalDebt > 0 ? money(totalDebt) : t("cabinetHome.balance.noDebt")}
            </p>
            {nextCharge && nextCharge.dueDate && (
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                {overdueTotal > 0
                  ? t("cabinetHome.balance.overdueLine", { amount: money(overdueTotal) })
                  : t("cabinetHome.balance.dueLine", { date: day(nextCharge.dueDate) })}
              </p>
            )}
            {totalDebt > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                <Link
                  href="/cabinet/finances"
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white"
                >
                  <Wallet className="h-4 w-4" />
                  {t("cabinetHome.balance.pay")}
                </Link>
                {recentDocs.find((d) => d.documentType === "INVOICE") && (
                  <a
                    href={`/api/documents/archive/${recentDocs.find((d) => d.documentType === "INVOICE")?.id}?format=pdf`}
                    download
                    className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    <Download className="h-4 w-4" />
                    {t("cabinetHome.balance.downloadInvoice")}
                  </a>
                )}
              </div>
            )}
          </div>
          <div className={`flex h-16 w-16 items-center justify-center rounded-2xl shrink-0 ${
            overdueTotal > 0 ? "bg-red-200 dark:bg-red-500/30" : totalDebt > 0 ? "bg-amber-200 dark:bg-amber-500/30" : "bg-emerald-200 dark:bg-emerald-500/30"
          }`}>
            <CreditCard className={`h-8 w-8 ${
              overdueTotal > 0 ? "text-red-600 dark:text-red-400" : totalDebt > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
            }`} />
          </div>
        </div>
      </div>

      {/* Информация по объекту + договору */}
      <PaymentQuickCard
        locale={locale}
        totalDebt={totalDebt}
        monthlyRent={calculateTenantMonthlyRent(tenant)}
        account={primaryBankAccount}
        recipient={landlord?.shortName ?? landlord?.fullName ?? null}
        taxId={landlord?.taxId ?? null}
        paymentPurpose={paymentPurpose}
      />

      {(tenantMustSignCount > 0 || pendingPaymentReports.length > 0 || pendingSignDocs.length > 0) && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("cabinetHome.waiting.title")}</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {t("cabinetHome.waiting.subtitle")}
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {pendingContracts.map((contract) => (
              <Link
                key={contract.id}
                href={contract.signToken ? `/sign/${contract.signToken}` : "/cabinet/documents"}
                className="rounded-lg border border-blue-200 bg-white p-3 text-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-900 dark:hover:bg-blue-500/10"
              >
                <div className="flex items-start gap-2">
                  <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {contract.status === "SIGNED_BY_TENANT"
                        ? t("cabinetHome.waiting.contractWaitsLandlord")
                        : t("cabinetHome.waiting.contractNeedsSign")}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {contract.type === "ADDENDUM" ? t("domain.docTypes.ADDENDUM") : t("domain.docTypes.CONTRACT")} № {contract.number}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
            {pendingPaymentReports.map((report) => (
              <Link
                key={report.id}
                href="/cabinet/finances"
                className="rounded-lg border border-blue-200 bg-white p-3 text-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-900 dark:hover:bg-blue-500/10"
              >
                <div className="flex items-start gap-2">
                  <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {report.status === "DISPUTED"
                        ? t("cabinetHome.waiting.paymentDisputed")
                        : t("cabinetHome.waiting.paymentChecking")}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {money(report.amount)} · {day(report.createdAt)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
            {pendingSignDocs.length > 0 && (
              <Link
                href="/cabinet/documents"
                className="rounded-lg border border-blue-200 bg-white p-3 text-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-900 dark:hover:bg-blue-500/10"
              >
                <div className="flex items-start gap-2">
                  <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{t("cabinetHome.waiting.actsNeedSign")}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {tp("cabinetHome.waiting.actsCount", pendingSignDocs.length)} · {t("cabinetHome.waiting.actsNeedSignHint")}
                    </p>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("cabinetHome.actions.title")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("cabinetHome.actions.subtitle")}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TenantNextAction
            href="/cabinet/finances#payment"
            icon={Wallet}
            title={totalDebt > 0 ? t("cabinetHome.actions.payTitle") : t("cabinetHome.actions.payTitleNoDebt")}
            text={totalDebt > 0
              ? t("cabinetHome.actions.payText", { amount: money(totalDebt) })
              : t("cabinetHome.actions.payTextNoDebt")}
          />
          <TenantNextAction
            href="/cabinet/finances#report-payment"
            icon={Receipt}
            title={t("cabinetHome.actions.reportTitle")}
            text={t("cabinetHome.actions.reportText")}
          />
          <TenantNextAction
            href="/cabinet/requests"
            icon={Camera}
            title={t("cabinetHome.actions.requestTitle")}
            text={activeRequestsCount > 0
              ? t("cabinetHome.actions.requestTextActive", { count: activeRequestsCount })
              : t("cabinetHome.actions.requestText")}
          />
          <TenantNextAction
            href="/cabinet/faq"
            icon={CircleHelp}
            title={t("cabinetHome.actions.faqTitle")}
            text={t("cabinetHome.actions.faqText")}
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoCard
          icon={Building2}
          label={t("cabinetHome.info.spaces")}
          value={assignedSpaces.length > 1
            ? tp("cabinetHome.info.spacesCount", assignedSpaces.length)
            : primarySpace ? t("cabinetHome.info.room", { number: primarySpace.number }) : "—"}
          sub={assignedSpaces.length > 0
            ? `${assignedSpaces.reduce((sum, space) => sum + space.area, 0)} м²`
            : t("cabinetHome.info.notAssigned")}
        />
        <InfoCard
          icon={Building2}
          label={t("cabinetHome.info.floor")}
          value={primarySpace?.floor.name ?? "—"}
          sub={building?.name}
        />
        <InfoCard
          icon={Calendar}
          label={t("cabinetHome.info.contractUntil")}
          value={tenant.contractEnd ? day(tenant.contractEnd) : "—"}
          sub={daysToContractEnd === null
            ? t("cabinetHome.info.contractNotSet")
            : daysToContractEnd < 0
              ? t("cabinetHome.info.contractExpired")
              : daysToContractEnd < 30
                ? t("cabinetHome.info.contractEndsIn", { count: daysToContractEnd })
                : t("cabinetHome.info.contractDaysLeft", { count: daysToContractEnd })}
          highlight={daysToContractEnd !== null && daysToContractEnd < 30}
        />
        <InfoCard
          icon={ClipboardList}
          label={t("cabinetHome.info.activeRequests")}
          value={String(activeRequestsCount)}
          sub={activeRequestsCount > 0 ? t("cabinetHome.info.inProgress") : t("cabinetHome.info.noOpen")}
          href="/cabinet/requests"
        />
      </div>

      {/* Календарь оплат — в стиле владельца (/admin/calendar) */}
      <PaymentsMiniCalendarLoader paymentDueDay={tenant.paymentDueDay ?? 10} />

      {/* Двухколоночный блок */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Документы (новые от арендодателя) */}
        <Card
          padded={false}
          icon={FileText}
          title={t("cabinetHome.documents.title")}
          actions={
            <Link href="/cabinet/documents" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              {t("cabinetHome.documents.all")} <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {recentDocs.length === 0 ? (
              <p className="px-5 py-10 text-sm text-slate-400 dark:text-slate-500 text-center">
                {t("cabinetHome.documents.empty")}
              </p>
            ) : (
              recentDocs.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {docTypeLabel(d.documentType)}
                      {d.number && ` № ${d.number}`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {d.period && <>{d.period} · </>}
                      {d.totalAmount && <b>{money(d.totalAmount)}</b>}
                      {!d.totalAmount && <>{day(d.generatedAt)}</>}
                    </p>
                  </div>
                  <a
                    href={`/api/documents/archive/${d.id}?format=pdf`}
                    download
                    className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 shrink-0"
                    title={t("common.actions.download")}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Сообщения */}
        <Card
          padded={false}
          icon={MessageSquare}
          title={
            <>
              {t("cabinetHome.messages.title")}
              {unreadMessages > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                  {unreadMessages}
                </span>
              )}
            </>
          }
          actions={
            <Link href="/cabinet/messages" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              {t("cabinetHome.messages.all")} <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {recentMessages.length === 0 ? (
              <p className="px-5 py-10 text-sm text-slate-400 dark:text-slate-500 text-center">
                {t("cabinetHome.messages.empty")}
              </p>
            ) : (
              recentMessages.map((m) => (
                <Link
                  key={m.id}
                  href="/cabinet/messages"
                  className={`flex items-start gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${!m.isRead ? "bg-blue-50 dark:bg-blue-500/20" : ""}`}
                >
                  {!m.isRead && <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {m.from.name}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 ml-2">
                        {day(m.createdAt)}
                      </p>
                    </div>
                    {m.subject && (
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{m.subject}</p>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{m.body}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Платежи и задолженности */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card
          padded={false}
          title={t("cabinetHome.charges.title")}
          actions={
            <Link href="/cabinet/finances" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              {t("cabinetHome.charges.all")} <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {tenant.charges.slice(0, 5).map((c) => {
              const isOverdue = c.dueDate && c.dueDate < today
              return (
                <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">
                      {chargeTypeLabel(c.type)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {c.period}
                      {c.dueDate && (
                        <span className={isOverdue ? "text-red-600 dark:text-red-400 font-medium ml-1" : "ml-1"}>
                          · {t("cabinetHome.charges.due", { date: day(c.dueDate) })}
                        </span>
                      )}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold ${isOverdue ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
                    {money(c.amount)}
                  </p>
                </div>
              )
            })}
            {debtCount > tenant.charges.length && (
              <p className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 text-center">
                {t("cabinetHome.charges.shown", { shown: tenant.charges.length, total: debtCount })}
              </p>
            )}
            {tenant.charges.length === 0 && (
              <p className="px-5 py-8 text-sm text-emerald-600 dark:text-emerald-400 text-center font-medium">
                ✓ {t("cabinetHome.charges.empty")}
              </p>
            )}
          </div>
        </Card>

        <Card
          padded={false}
          title={t("cabinetHome.payments.title")}
          actions={
            <Link href="/cabinet/finances" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              {t("cabinetHome.payments.history")} <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {tenant.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">{p.method}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {day(p.paymentDate)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{money(p.amount)}</p>
              </div>
            ))}
            {tenant.payments.length === 0 && (
              <p className="px-5 py-8 text-sm text-slate-400 dark:text-slate-500 text-center">{t("cabinetHome.payments.empty")}</p>
            )}
          </div>
        </Card>
      </div>

      <MobileTenantActionBar
        locale={locale}
        debt={totalDebt}
        pendingSignatures={tenantMustSignCount}
      />
    </div>
  )
  })
}

async function PaymentQuickCard({
  locale,
  totalDebt,
  monthlyRent,
  account,
  recipient,
  taxId,
  paymentPurpose,
}: {
  locale: Locale
  totalDebt: number
  monthlyRent: number
  account: { label: string; bank: string; iik: string; bik: string; isPrimary: boolean } | null
  recipient: string | null
  taxId: string | null
  paymentPurpose: string
}) {
  const { t } = await getT(locale)
  const amount = totalDebt > 0 ? totalDebt : monthlyRent

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("cabinetHome.payCard.title")}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("cabinetHome.payCard.subtitle")}
          </p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <PaymentLine label={t("domain.requisites.amount")} value={formatMoneyL(locale, amount)} strong />
            <PaymentLine label={t("domain.requisites.recipient")} value={recipient ?? t("cabinetHome.payCard.recipientUnknown")} />
            <PaymentLine label={t("domain.requisites.taxId")} value={taxId ?? "—"} />
            <PaymentLine label={t("domain.requisites.bank")} value={account?.bank ?? "—"} />
            <PaymentLine label={t("domain.requisites.bik")} value={account?.bik ?? "—"} />
            <PaymentLine label={t("domain.requisites.iik")} value={account?.iik ?? "—"} />
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <span className="font-medium">{t("domain.requisites.purpose")}:</span> {paymentPurpose}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <Link
            href="/cabinet/finances#payment"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <CreditCard className="h-4 w-4" />
            {t("cabinetHome.payCard.qr")}
          </Link>
          <Link
            href="/cabinet/finances#report-payment"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Receipt className="h-4 w-4" />
            {t("cabinetHome.payCard.reported")}
          </Link>
        </div>
      </div>
    </section>
  )
}

function PaymentLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-sm ${strong ? "font-bold text-slate-900 dark:text-slate-100" : "font-medium text-slate-700 dark:text-slate-200"}`}>
        {value}
      </p>
    </div>
  )
}

function TenantNextAction({
  href,
  icon: Icon,
  title,
  text,
}: {
  href: string
  icon: React.ElementType
  title: string
  text: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10"
    >
      <Icon className="h-5 w-5 text-blue-500" />
      <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{text}</p>
    </Link>
  )
}

function InfoCard({
  icon: Icon, label, value, sub, highlight, href,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  highlight?: boolean
  href?: string
}) {
  const inner = (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border p-4 transition ${highlight ? "border-amber-200 dark:border-amber-500/30 ring-1 ring-amber-100" : "border-slate-200 dark:border-slate-800"} ${href ? "hover:shadow-sm" : ""}`}>
      <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500 mb-2" />
      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{label}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${highlight ? "text-amber-600 dark:text-amber-400 font-medium" : "text-slate-400 dark:text-slate-500"}`}>{sub}</p>}
    </div>
  )
  return href ? (
    <Link
      href={href}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
    >
      {inner}
    </Link>
  ) : inner
}

async function MobileTenantActionBar({
  locale,
  debt,
  pendingSignatures,
}: {
  locale: Locale
  debt: number
  pendingSignatures: number
}) {
  const { t } = await getT(locale)
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:hidden">
      <div className="grid grid-cols-3 gap-2">
        <Link
          href="/cabinet/finances#payment"
          className="flex flex-col items-center justify-center rounded-xl bg-blue-600 px-2 py-2 text-[11px] font-semibold text-white"
        >
          <Wallet className="mb-1 h-4 w-4" />
          {debt > 0 ? t("cabinetHome.mobileBar.pay") : t("cabinetHome.mobileBar.requisites")}
        </Link>
        <Link
          href="/cabinet/finances#report-payment"
          className="flex flex-col items-center justify-center rounded-xl border border-slate-200 px-2 py-2 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          <Receipt className="mb-1 h-4 w-4" />
          {t("cabinetHome.mobileBar.reported")}
        </Link>
        <Link
          href={pendingSignatures > 0 ? "/cabinet/documents" : "/cabinet/requests"}
          className="flex flex-col items-center justify-center rounded-xl border border-slate-200 px-2 py-2 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          {pendingSignatures > 0 ? <FileSignature className="mb-1 h-4 w-4" /> : <Camera className="mb-1 h-4 w-4" />}
          {pendingSignatures > 0 ? t("cabinetHome.mobileBar.sign") : t("cabinetHome.mobileBar.request")}
        </Link>
      </div>
    </div>
  )
}
