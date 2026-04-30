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

export default async function CabinetDashboard() {
  const session = await auth()

  const tenant = await db.tenant.findUnique({
    where: { userId: session!.user.id },
    include: {
      space: { include: { floor: true } },
      charges: {
        where: { isPaid: false },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      },
      payments: {
        orderBy: { paymentDate: "desc" },
        take: 3,
      },
      requests: {
        where: { status: { in: ["NEW", "IN_PROGRESS"] } },
      },
    },
  })

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">Данные арендатора не найдены.</p>
          <p className="text-sm text-slate-400 mt-1">Обратитесь к администратору.</p>
        </div>
      </div>
    )
  }

  const totalDebt = tenant.charges.reduce((s, c) => s + c.amount, 0)
  const nextCharge = tenant.charges[0]
  const today = new Date()
  const daysToContractEnd = tenant.contractEnd
    ? Math.ceil((tenant.contractEnd.getTime() - today.getTime()) / 86_400_000)
    : null

  // Просрочки и предстоящие платежи
  const overdueCharges = tenant.charges.filter(
    (c) => c.dueDate && c.dueDate < today
  )
  const overdueTotal = overdueCharges.reduce((s, c) => s + c.amount, 0)

  // Здание показываем только из организации арендатора
  const [building, recentDocs, unreadMessages, recentMessages] = await Promise.all([
    db.building.findFirst({
      where: {
        isActive: true,
        organizationId: session!.user.organizationId ?? "__none__",
      },
    }),
    db.generatedDocument.findMany({
      where: { tenantId: tenant.id },
      orderBy: { generatedAt: "desc" },
      take: 5,
      select: {
        id: true, number: true, documentType: true,
        period: true, totalAmount: true, generatedAt: true, fileName: true,
      },
    }).catch(() => []),
    db.message.count({
      where: { toId: session!.user.id, isRead: false },
    }).catch(() => 0),
    db.message.findMany({
      where: { toId: session!.user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true, subject: true, body: true, isRead: true, createdAt: true,
        from: { select: { name: true } },
      },
    }).catch(() => []),
  ])

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
        <h1 className="text-2xl font-semibold text-slate-900">
          Здравствуйте, {session?.user.name?.split(" ")[0] ?? session?.user.name}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {tenant.companyName}{building?.name ? ` · ${building.name}` : ""}
        </p>
      </div>

      {/* Главная карточка состояния */}
      <div className={`rounded-2xl p-6 ${
        overdueTotal > 0
          ? "bg-gradient-to-br from-red-50 to-red-100 border border-red-200"
          : totalDebt > 0
            ? "bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200"
            : "bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200"
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              {overdueTotal > 0 ? "Просрочка платежа" : totalDebt > 0 ? "К оплате" : "Состояние счёта"}
            </p>
            <p className={`text-3xl md:text-4xl font-bold mt-2 ${
              overdueTotal > 0 ? "text-red-700" : totalDebt > 0 ? "text-amber-700" : "text-emerald-700"
            }`}>
              {totalDebt > 0 ? formatMoney(totalDebt) : "Задолженности нет"}
            </p>
            {nextCharge && nextCharge.dueDate && (
              <p className="text-sm text-slate-700 mt-2">
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
                    className="inline-flex items-center gap-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    <Download className="h-4 w-4" />
                    Скачать счёт
                  </a>
                )}
              </div>
            )}
          </div>
          <div className={`flex h-16 w-16 items-center justify-center rounded-2xl shrink-0 ${
            overdueTotal > 0 ? "bg-red-200/50" : totalDebt > 0 ? "bg-amber-200/50" : "bg-emerald-200/50"
          }`}>
            <CreditCard className={`h-8 w-8 ${
              overdueTotal > 0 ? "text-red-600" : totalDebt > 0 ? "text-amber-600" : "text-emerald-600"
            }`} />
          </div>
        </div>
      </div>

      {/* Информация по объекту + договору */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoCard
          icon={Building2}
          label="Помещение"
          value={tenant.space ? `Каб. ${tenant.space.number}` : "—"}
          sub={tenant.space ? `${tenant.space.area} м²` : "Не назначено"}
        />
        <InfoCard
          icon={Building2}
          label="Этаж"
          value={tenant.space?.floor.name ?? "—"}
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
          value={String(tenant.requests.length)}
          sub={tenant.requests.length > 0 ? "в работе" : "нет открытых"}
          href="/cabinet/requests"
        />
      </div>

      {/* Двухколоночный блок */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Документы (новые от арендодателя) */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              Документы
            </h2>
            <Link href="/cabinet/documents" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              Все <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentDocs.length === 0 ? (
              <p className="px-5 py-10 text-sm text-slate-400 text-center">
                Документы появятся здесь после генерации арендодателем
              </p>
            ) : (
              recentDocs.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {docTypeLabels[d.documentType] ?? d.documentType}
                      {d.number && ` № ${d.number}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {d.period && <>{d.period} · </>}
                      {d.totalAmount && <b>{formatMoney(d.totalAmount)}</b>}
                      {!d.totalAmount && <>{new Date(d.generatedAt).toLocaleDateString("ru-RU")}</>}
                    </p>
                  </div>
                  <a
                    href={`/api/documents/archive/${d.id}`}
                    download={d.fileName}
                    className="text-slate-400 hover:text-blue-600 shrink-0"
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
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-slate-400" />
              Сообщения
              {unreadMessages > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                  {unreadMessages}
                </span>
              )}
            </h2>
            <Link href="/cabinet/messages" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              Все <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentMessages.length === 0 ? (
              <p className="px-5 py-10 text-sm text-slate-400 text-center">
                Здесь будут сообщения от арендодателя
              </p>
            ) : (
              recentMessages.map((m) => (
                <Link
                  key={m.id}
                  href="/cabinet/messages"
                  className={`flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition ${!m.isRead ? "bg-blue-50/30" : ""}`}
                >
                  {!m.isRead && <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {m.from.name}
                      </p>
                      <p className="text-[10px] text-slate-400 shrink-0 ml-2">
                        {new Date(m.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                      </p>
                    </div>
                    {m.subject && (
                      <p className="text-xs font-medium text-slate-700 truncate">{m.subject}</p>
                    )}
                    <p className="text-xs text-slate-500 line-clamp-1">{m.body}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Платежи и задолженности */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Неоплаченные начисления</h2>
            <Link href="/cabinet/finances" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              Все <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {tenant.charges.slice(0, 5).map((c) => {
              const isOverdue = c.dueDate && c.dueDate < today
              return (
                <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-slate-900 font-medium">
                      {CHARGE_TYPES[c.type] ?? c.type}
                    </p>
                    <p className="text-xs text-slate-500">
                      {c.period}
                      {c.dueDate && (
                        <span className={isOverdue ? "text-red-600 font-medium ml-1" : "ml-1"}>
                          · до {new Date(c.dueDate).toLocaleDateString("ru-RU")}
                        </span>
                      )}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold ${isOverdue ? "text-red-600" : "text-slate-900"}`}>
                    {formatMoney(c.amount)}
                  </p>
                </div>
              )
            })}
            {tenant.charges.length === 0 && (
              <p className="px-5 py-8 text-sm text-emerald-600 text-center font-medium">
                ✓ Нет неоплаченных начислений
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Последние оплаты</h2>
            <Link href="/cabinet/finances" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              История <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {tenant.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-slate-900 font-medium">{p.method}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(p.paymentDate).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-600">{formatMoney(p.amount)}</p>
              </div>
            ))}
            {tenant.payments.length === 0 && (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">Нет оплат</p>
            )}
          </div>
        </div>
      </div>
    </div>
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
    <div className={`bg-white rounded-xl border p-4 transition ${highlight ? "border-amber-200 ring-1 ring-amber-100" : "border-slate-200"} ${href ? "hover:shadow-sm" : ""}`}>
      <Icon className="h-4 w-4 text-slate-400 mb-2" />
      <p className="text-base font-semibold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{label}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${highlight ? "text-amber-600 font-medium" : "text-slate-400"}`}>{sub}</p>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}
