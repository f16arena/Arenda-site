export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"
import { formatMoney } from "@/lib/utils"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { computeDepositStatus, DEPOSIT_STATUS_LABELS, type DepositStatus } from "@/lib/deposit"
import { ShieldCheck, ShieldAlert, Wallet, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { DepositsTable, type DepositRow } from "./deposits-table"

const STATUS_ORDER: Record<DepositStatus, number> = {
  UNPAID: 0,
  NOT_ISSUED: 1,
  PARTIAL: 2,
  PAID: 3,
  RETURNED: 4,
  NOT_REQUIRED: 5,
}

export default async function DepositsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  if (
    session.user.role !== "OWNER" &&
    session.user.role !== "ADMIN" &&
    session.user.role !== "ACCOUNTANT" &&
    !session.user.isPlatformOwner
  ) {
    redirect("/admin")
  }
  const { orgId } = await requireOrgAccess()

  const tenants = await db.tenant.findMany({
    where: tenantScope(orgId),
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      depositAmount: true,
      customRate: true,
      fixedMonthlyRent: true,
      space: { select: { number: true, area: true, floor: { select: { ratePerSqm: true } } } },
      tenantSpaces: { select: { space: { select: { number: true, area: true, floor: { select: { ratePerSqm: true } } } } } },
      fullFloors: { select: { number: true, name: true, fixedMonthlyRent: true } },
      contracts: {
        where: { status: "SIGNED", deletedAt: null, type: { not: "ADDENDUM" } },
        orderBy: [{ version: "desc" }, { signedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { number: true },
      },
      charges: {
        where: { type: { in: ["DEPOSIT", "DEPOSIT_REFUND"] }, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, amount: true, isPaid: true },
      },
    },
  })

  const rows: DepositRow[] = tenants
    // Показываем только «реальных» арендаторов: с размещением, договором или депозитными записями.
    .filter((t) =>
      t.space || t.tenantSpaces.length > 0 || t.fullFloors.length > 0 ||
      t.contracts.length > 0 || t.charges.length > 0,
    )
    .map((t) => {
      // depositAmount = 0 — депозит явно не требуется; null — дефолт 1 мес. аренды.
      const required = t.depositAmount === 0
        ? 0
        : Math.round((t.depositAmount ?? calculateTenantMonthlyRent(t)) * 100) / 100
      // Удерживается = оплаченные DEPOSIT − DEPOSIT_REFUND (возвраты — отдельным типом).
      const held = Math.round(
        t.charges.reduce((sum, c) => {
          if (c.type === "DEPOSIT_REFUND") return sum - c.amount
          return c.isPaid ? sum + c.amount : sum
        }, 0) * 100,
      ) / 100
      const unpaidCharge = t.charges.find((c) => c.type === "DEPOSIT" && !c.isPaid && c.amount > 0) ?? null
      const hasRefund = t.charges.some((c) => c.type === "DEPOSIT_REFUND")
      const status = computeDepositStatus({
        required,
        held,
        hasUnpaid: !!unpaidCharge,
        hasAnyCharge: t.charges.length > 0,
        hasRefund,
      })

      const spaces = t.tenantSpaces.length > 0 ? t.tenantSpaces.map((x) => x.space) : t.space ? [t.space] : []
      const placement = [
        ...spaces.map((s) => `Пом. ${s.number}`),
        ...t.fullFloors.map((f) => f.name?.trim() || `Этаж ${f.number} целиком`),
      ].join(", ")

      return {
        tenantId: t.id,
        companyName: t.companyName,
        placement,
        contractNumber: t.contracts[0]?.number ?? null,
        required,
        held,
        status,
        statusLabel: DEPOSIT_STATUS_LABELS[status],
        unpaidChargeId: unpaidCharge?.id ?? null,
      }
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.companyName.localeCompare(b.companyName, "ru"))

  const active = rows.filter((r) => r.status !== "NOT_REQUIRED" && r.status !== "RETURNED")
  const heldTotal = rows.reduce((sum, r) => sum + Math.max(0, r.held), 0)
  const missingRows = active.filter((r) => r.status === "UNPAID" || r.status === "NOT_ISSUED" || r.status === "PARTIAL")
  const missingTotal = missingRows.reduce((sum, r) => sum + Math.max(0, r.required - r.held), 0)
  const paidCount = active.filter((r) => r.status === "PAID").length

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Главная", href: "/admin" },
          { label: "Финансы", href: "/admin/finances" },
          { label: "Депозиты" },
        ]}
      />
      <div className="flex items-center gap-3">
        <Link
          href="/admin/finances"
          className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            Гарантийные депозиты
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Кто внёс депозит, кто нет, и сколько удерживается
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={Wallet} label="Удерживается депозитов" value={formatMoney(heldTotal)} color="slate" big />
        <SummaryCard icon={ShieldCheck} label="Внесли депозит" value={`${paidCount} из ${active.length}`} color="emerald" />
        <SummaryCard icon={ShieldAlert} label="Не внесли / частично" value={String(missingRows.length)} color="red" />
        <SummaryCard icon={Wallet} label="Недополучено" value={formatMoney(missingTotal)} color="amber" />
      </div>

      <DepositsTable rows={rows} />

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Начисление депозита создаётся автоматически при подписании договора (если депозит не отключён в
        конструкторе). Оплата засчитывается платежом на странице «Финансы» или кнопкой «Отметить внесённым».
        Возврат при выезде фиксируется кнопкой «Вернуть».
      </p>
    </div>
  )
}

function SummaryCard({
  icon: Icon, label, value, color, big,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: "slate" | "emerald" | "red" | "amber"
  big?: boolean
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  }
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border ${big ? "border-slate-300 dark:border-slate-700" : "border-slate-200 dark:border-slate-800"} p-5`}>
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]} mb-3`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className={`${big ? "text-3xl" : "text-xl"} font-bold text-slate-900 dark:text-slate-100`}>{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}
