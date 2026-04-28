import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatMoney, CHARGE_TYPES } from "@/lib/utils"
import { CreditCard, FileText, ClipboardList, Building2, Calendar, AlertCircle } from "lucide-react"
import Link from "next/link"

export default async function CabinetDashboard() {
  const session = await auth()

  const tenant = await db.tenant.findUnique({
    where: { userId: session!.user.id },
    include: {
      space: { include: { floor: true } },
      charges: {
        where: { isPaid: false },
        orderBy: { createdAt: "desc" },
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
  const building = await db.building.findFirst({ where: { isActive: true } })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Добро пожаловать, {session?.user.name}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">{tenant.companyName}</p>
      </div>

      {/* Balance card */}
      <div className={`rounded-xl p-6 ${totalDebt > 0 ? "bg-red-50 border border-red-200" : "bg-emerald-50 border border-emerald-200"}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600">
              {totalDebt > 0 ? "Задолженность" : "Задолженности нет"}
            </p>
            <p className={`text-3xl font-bold mt-1 ${totalDebt > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {totalDebt > 0 ? formatMoney(totalDebt) : "0 ₸"}
            </p>
            {nextCharge && (
              <p className="text-sm text-slate-500 mt-2">
                Ближайший платёж: {nextCharge.dueDate
                  ? new Date(nextCharge.dueDate).toLocaleDateString("ru-RU")
                  : "не указана дата"}
              </p>
            )}
          </div>
          <CreditCard className={`h-8 w-8 ${totalDebt > 0 ? "text-red-400" : "text-emerald-400"}`} />
        </div>
      </div>

      {/* Quick info grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoCard
          icon={Building2}
          label="Помещение"
          value={tenant.space ? `Кабинет ${tenant.space.number}` : "Не назначено"}
          sub={tenant.space?.floor.name}
        />
        <InfoCard
          icon={Building2}
          label="Площадь"
          value={tenant.space ? `${tenant.space.area} м²` : "—"}
          sub={building?.name}
        />
        <InfoCard
          icon={Calendar}
          label="Договор до"
          value={tenant.contractEnd
            ? new Date(tenant.contractEnd).toLocaleDateString("ru-RU")
            : "Не указан"}
          sub={tenant.contractStart
            ? `с ${new Date(tenant.contractStart).toLocaleDateString("ru-RU")}`
            : undefined}
        />
        <InfoCard
          icon={ClipboardList}
          label="Заявки"
          value={String(tenant.requests.length)}
          sub="активных"
        />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Unpaid charges */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Неоплаченные начисления</h2>
            <Link href="/cabinet/finances" className="text-xs text-blue-600 hover:underline">
              Все
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {tenant.charges.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-slate-700">{CHARGE_TYPES[c.type] ?? c.type}</p>
                  <p className="text-xs text-slate-400">{c.period}</p>
                </div>
                <p className="text-sm font-medium text-red-600">{formatMoney(c.amount)}</p>
              </div>
            ))}
            {tenant.charges.length === 0 && (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">Нет неоплаченных начислений</p>
            )}
          </div>
        </div>

        {/* Recent payments */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Последние оплаты</h2>
            <Link href="/cabinet/finances" className="text-xs text-blue-600 hover:underline">
              История
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {tenant.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-slate-700">{p.method}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(p.paymentDate).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <p className="text-sm font-medium text-emerald-600">{formatMoney(p.amount)}</p>
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
  icon: Icon, label, value, sub,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <Icon className="h-4 w-4 text-slate-400 mb-3" />
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
