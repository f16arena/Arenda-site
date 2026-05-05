export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatMoney, CHARGE_TYPES } from "@/lib/utils"
import {
  CreditCard, FileText, ClipboardList, Building2, Calendar,
  AlertCircle, MessageSquare, Download, ArrowRight, Receipt,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { PaymentsMiniCalendarLoader } from "./payments-mini-calendar-loader"
import { safeServerValue } from "@/lib/server-fallback"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"

const PAYMENT_CALENDAR_LIMIT = 120

export default async function CabinetDashboard() {
  return measureServerRoute("/cabinet", async () => {
  const session = await auth()
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
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { space: { include: { floor: true } } },
      },
      charges: {
        where: { isPaid: false },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 8,
      },
      payments: {
        orderBy: { paymentDate: "desc" },
        take: 3,
      },
    },
  })

  // Для календаря — все charges и payments за последние 12 месяцев + следующие 3
  const calendarStart = new Date()
  calendarStart.setMonth(calendarStart.getMonth() - 12)
  const calendarEnd = new Date()
  calendarEnd.setMonth(calendarEnd.getMonth() + 3)
  const [allCharges, allPayments] = tenant ? await measureServerStep(
    "/cabinet",
    "calendar-window",
    Promise.all([
      safe(
        "cabinet.dashboard.calendarCharges",
        db.charge.findMany({
          where: {
            tenantId: tenant.id,
            OR: [
              { dueDate: { gte: calendarStart, lt: calendarEnd } },
              { dueDate: null, createdAt: { gte: calendarStart } },
            ],
          },
          select: {
            id: true, amount: true, type: true, period: true,
            isPaid: true, dueDate: true,
          },
          take: PAYMENT_CALENDAR_LIMIT,
        }),
        [],
      ),
      safe(
        "cabinet.dashboard.calendarPayments",
        db.payment.findMany({
          where: {
            tenantId: tenant.id,
            paymentDate: { gte: calendarStart, lt: calendarEnd },
          },
          select: { id: true, amount: true, paymentDate: true },
          take: PAYMENT_CALENDAR_LIMIT,
        }),
        [],
      ),
    ]),
  ) : [[], []]

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-400 dark:text-slate-500">Данные арендатора не найдены.</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Обратитесь к администратору.</p>
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
  const paymentPurpose = `Аренда ${tenant.companyName}, период ${currentPeriod}`

  const docTypeLabels: Record<string, string> = {
    INVOICE: "Счёт на оплату",
    ACT: "Акт услуг",
    RECONCILIATION: "Акт сверки",
    HANDOVER: "Передача",
    CONTRACT: "Договор",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Здравствуйте, {session?.user.name?.split(" ")[0] ?? session?.user.name}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
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
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              {overdueTotal > 0 ? "Просрочка платежа" : totalDebt > 0 ? "К оплате" : "Состояние счёта"}
            </p>
            <p className={`text-3xl md:text-4xl font-bold mt-2 ${
              overdueTotal > 0 ? "text-red-700 dark:text-red-300" : totalDebt > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
            }`}>
              {totalDebt > 0 ? formatMoney(totalDebt) : "Задолженности нет"}
            </p>
            {nextCharge && nextCharge.dueDate && (
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                {overdueTotal > 0
                  ? <span><b>Просрочено:</b> {formatMoney(overdueTotal)} · оплатите как можно скорее</span>
                  : <span><b>Срок оплаты:</b> до {new Date(nextCharge.dueDate).toLocaleDateString("ru-RU")}</span>}
              </p>
            )}
            {totalDebt > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                <Link
                  href="/cabinet/finances"
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white"
                >
                  <Wallet className="h-4 w-4" />
                  Перейти к оплате
                </Link>
                {recentDocs.find((d) => d.documentType === "INVOICE") && (
                  <a
                    href={`/api/documents/archive/${recentDocs.find((d) => d.documentType === "INVOICE")?.id}`}
                    download
                    className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    <Download className="h-4 w-4" />
                    Скачать счёт
                  </a>
                )}
              </div>
            )}
          </div>
          <div className={`flex h-16 w-16 items-center justify-center rounded-2xl shrink-0 ${
            overdueTotal > 0 ? "bg-red-200 dark:bg-red-500/30/50" : totalDebt > 0 ? "bg-amber-200 dark:bg-amber-500/30/50" : "bg-emerald-200 dark:bg-emerald-500/30/50"
          }`}>
            <CreditCard className={`h-8 w-8 ${
              overdueTotal > 0 ? "text-red-600 dark:text-red-400" : totalDebt > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
            }`} />
          </div>
        </div>
      </div>

      {/* Информация по объекту + договору */}
      <PaymentQuickCard
        totalDebt={totalDebt}
        monthlyRent={calculateTenantMonthlyRent(tenant)}
        account={primaryBankAccount}
        recipient={landlord?.shortName ?? landlord?.fullName ?? null}
        taxId={landlord?.taxId ?? null}
        paymentPurpose={paymentPurpose}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Что сделать сейчас</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Самые частые действия вынесены сюда, чтобы не искать их в меню.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <TenantNextAction
            href="/cabinet/finances#payment"
            icon={Wallet}
            title={totalDebt > 0 ? "Оплатить аренду" : "Посмотреть реквизиты"}
            text={totalDebt > 0 ? `К оплате ${formatMoney(totalDebt)}` : "Долга нет, реквизиты доступны заранее"}
          />
          <TenantNextAction
            href="/cabinet/finances#report-payment"
            icon={Receipt}
            title="Я оплатил"
            text="Отправьте чек, чтобы администратор подтвердил платеж."
          />
          <TenantNextAction
            href="/cabinet/requests"
            icon={ClipboardList}
            title="Создать заявку"
            text={activeRequestsCount > 0 ? `${activeRequestsCount} заявок уже в работе` : "Ремонт, обслуживание или вопрос администратору."}
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoCard
          icon={Building2}
          label="Помещения"
          value={assignedSpaces.length > 1 ? `${assignedSpaces.length} помещ.` : primarySpace ? `Каб. ${primarySpace.number}` : "—"}
          sub={assignedSpaces.length > 0 ? `${assignedSpaces.reduce((sum, space) => sum + space.area, 0)} м²` : "Не назначено"}
        />
        <InfoCard
          icon={Building2}
          label="Этаж"
          value={primarySpace?.floor.name ?? "—"}
          sub={building?.name}
        />
        <InfoCard
          icon={Calendar}
          label="Договор до"
          value={tenant.contractEnd
            ? new Date(tenant.contractEnd).toLocaleDateString("ru-RU")
            : "—"}
          sub={daysToContractEnd === null
            ? "Не указан"
            : daysToContractEnd < 0
              ? "Истёк"
              : daysToContractEnd < 30
                ? `Истекает через ${daysToContractEnd} дн.`
                : `${daysToContractEnd} дн. осталось`}
          highlight={daysToContractEnd !== null && daysToContractEnd < 30}
        />
        <InfoCard
          icon={ClipboardList}
          label="Активные заявки"
          value={String(activeRequestsCount)}
          sub={activeRequestsCount > 0 ? "в работе" : "нет открытых"}
          href="/cabinet/requests"
        />
      </div>

      {/* Календарь оплат */}
      <PaymentsMiniCalendarLoader
        charges={allCharges.map((c) => ({
          id: c.id,
          amount: c.amount,
          type: c.type,
          period: c.period,
          isPaid: c.isPaid,
          dueDate: c.dueDate ? c.dueDate.toISOString() : null,
        }))}
        payments={allPayments.map((p) => ({
          id: p.id,
          amount: p.amount,
          paymentDate: p.paymentDate.toISOString(),
        }))}
        paymentDueDay={tenant.paymentDueDay ?? 10}
      />

      {/* Двухколоночный блок */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Документы (новые от арендодателя) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              Документы
            </h2>
            <Link href="/cabinet/documents" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              Все <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentDocs.length === 0 ? (
              <p className="px-5 py-10 text-sm text-slate-400 dark:text-slate-500 text-center">
                Документы появятся здесь после генерации арендодателем
              </p>
            ) : (
              recentDocs.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {docTypeLabels[d.documentType] ?? d.documentType}
                      {d.number && ` № ${d.number}`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {d.period && <>{d.period} · </>}
                      {d.totalAmount && <b>{formatMoney(d.totalAmount)}</b>}
                      {!d.totalAmount && <>{new Date(d.generatedAt).toLocaleDateString("ru-RU")}</>}
                    </p>
                  </div>
                  <a
                    href={`/api/documents/archive/${d.id}`}
                    download={d.fileName}
                    className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:text-blue-400 shrink-0"
                    title="Скачать"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Сообщения */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              Сообщения
              {unreadMessages > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                  {unreadMessages}
                </span>
              )}
            </h2>
            <Link href="/cabinet/messages" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              Все <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentMessages.length === 0 ? (
              <p className="px-5 py-10 text-sm text-slate-400 dark:text-slate-500 text-center">
                Здесь будут сообщения от арендодателя
              </p>
            ) : (
              recentMessages.map((m) => (
                <Link
                  key={m.id}
                  href="/cabinet/messages"
                  className={`flex items-start gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition ${!m.isRead ? "bg-blue-50 dark:bg-blue-500/10/30" : ""}`}
                >
                  {!m.isRead && <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {m.from.name}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 ml-2">
                        {new Date(m.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                      </p>
                    </div>
                    {m.subject && (
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{m.subject}</p>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 line-clamp-1">{m.body}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Платежи и задолженности */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Неоплаченные начисления</h2>
            <Link href="/cabinet/finances" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              Все <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {tenant.charges.slice(0, 5).map((c) => {
              const isOverdue = c.dueDate && c.dueDate < today
              return (
                <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">
                      {CHARGE_TYPES[c.type] ?? c.type}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {c.period}
                      {c.dueDate && (
                        <span className={isOverdue ? "text-red-600 dark:text-red-400 font-medium ml-1" : "ml-1"}>
                          · до {new Date(c.dueDate).toLocaleDateString("ru-RU")}
                        </span>
                      )}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold ${isOverdue ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
                    {formatMoney(c.amount)}
                  </p>
                </div>
              )
            })}
            {debtCount > tenant.charges.length && (
              <p className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 text-center">
                Показаны ближайшие {tenant.charges.length} из {debtCount} неоплаченных начислений.
              </p>
            )}
            {tenant.charges.length === 0 && (
              <p className="px-5 py-8 text-sm text-emerald-600 dark:text-emerald-400 text-center font-medium">
                ✓ Нет неоплаченных начислений
              </p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Последние оплаты</h2>
            <Link href="/cabinet/finances" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              История <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {tenant.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">{p.method}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {new Date(p.paymentDate).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(p.amount)}</p>
              </div>
            ))}
            {tenant.payments.length === 0 && (
              <p className="px-5 py-8 text-sm text-slate-400 dark:text-slate-500 text-center">Нет оплат</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
  })
}

function PaymentQuickCard({
  totalDebt,
  monthlyRent,
  account,
  recipient,
  taxId,
  paymentPurpose,
}: {
  totalDebt: number
  monthlyRent: number
  account: { label: string; bank: string; iik: string; bik: string; isPrimary: boolean } | null
  recipient: string | null
  taxId: string | null
  paymentPurpose: string
}) {
  const amount = totalDebt > 0 ? totalDebt : monthlyRent

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Куда оплатить</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Первый экран оплаты: сумма, назначение платежа и реквизиты без контактов владельца.
          </p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <PaymentLine label="Сумма" value={formatMoney(amount)} strong />
            <PaymentLine label="Получатель" value={recipient ?? "Реквизиты уточняются"} />
            <PaymentLine label="ИИН/БИН" value={taxId ?? "—"} />
            <PaymentLine label="Банк" value={account?.bank ?? "—"} />
            <PaymentLine label="БИК" value={account?.bik ?? "—"} />
            <PaymentLine label="ИИК" value={account?.iik ?? "—"} />
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <span className="font-medium">Назначение:</span> {paymentPurpose}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <Link
            href="/cabinet/finances#payment"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <CreditCard className="h-4 w-4" />
            QR / Kaspi
          </Link>
          <Link
            href="/cabinet/finances#report-payment"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Receipt className="h-4 w-4" />
            Я оплатил
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
      <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5 font-medium">{label}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${highlight ? "text-amber-600 dark:text-amber-400 font-medium" : "text-slate-400 dark:text-slate-500"}`}>{sub}</p>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}
