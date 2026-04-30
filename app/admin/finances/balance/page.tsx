export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import { formatMoney } from "@/lib/utils"
import {
  Wallet, Banknote, CreditCard, ArrowLeft, ArrowDown, ArrowUp,
  ArrowRightLeft, Settings,
} from "lucide-react"
import Link from "next/link"
import { BalanceClient } from "./balance-client"

export default async function BalancePage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT" && !session.user.isPlatformOwner) {
    redirect("/admin")
  }
  const { orgId } = await requireOrgAccess()

  const accounts = await db.cashAccount.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    include: {
      transactions: {
        orderBy: { date: "desc" },
        take: 10,
      },
    },
  })

  const totalByType: Record<string, number> = { BANK: 0, CASH: 0, CARD: 0 }
  let total = 0
  for (const a of accounts) {
    totalByType[a.type] = (totalByType[a.type] ?? 0) + a.balance
    total += a.balance
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/finances"
          className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            Баланс счетов
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Сколько денег где находится
          </p>
        </div>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={Wallet}
          label="Всего"
          value={formatMoney(total)}
          color="slate"
          big
        />
        <SummaryCard
          icon={Banknote}
          label="На счетах в банке"
          value={formatMoney(totalByType.BANK ?? 0)}
          color="blue"
        />
        <SummaryCard
          icon={Wallet}
          label="Наличными"
          value={formatMoney(totalByType.CASH ?? 0)}
          color="emerald"
        />
        <SummaryCard
          icon={CreditCard}
          label="Картами"
          value={formatMoney(totalByType.CARD ?? 0)}
          color="purple"
        />
      </div>

      <BalanceClient
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balance: a.balance,
          currency: a.currency,
          notes: a.notes,
          recentTransactions: a.transactions.map((t) => ({
            id: t.id,
            amount: t.amount,
            type: t.type,
            description: t.description,
            date: t.date.toISOString(),
          })),
        }))}
      />
    </div>
  )
}

function SummaryCard({
  icon: Icon, label, value, color, big,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: "slate" | "blue" | "emerald" | "purple"
  big?: boolean
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  }
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border ${big ? "border-slate-300 dark:border-slate-700" : "border-slate-200 dark:border-slate-800"} p-5`}>
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]} mb-3`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className={`${big ? "text-3xl" : "text-xl"} font-bold text-slate-900 dark:text-slate-100`}>
        {value}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}
