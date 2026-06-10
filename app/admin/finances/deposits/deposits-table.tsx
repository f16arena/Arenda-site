"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { formatMoney } from "@/lib/utils"
import { issueDepositCharge, markDepositPaid, returnDeposit } from "@/app/actions/deposits"
import type { DepositStatus } from "@/lib/deposit"
import { Loader2 } from "lucide-react"

export interface DepositRow {
  tenantId: string
  companyName: string
  placement: string
  contractNumber: string | null
  required: number
  held: number
  status: DepositStatus
  statusLabel: string
  unpaidChargeId: string | null
}

const STATUS_STYLES: Record<DepositStatus, string> = {
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  PARTIAL: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  UNPAID: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  NOT_ISSUED: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  RETURNED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  NOT_REQUIRED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
}

export function DepositsTable({ rows }: { rows: DepositRow[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function run(tenantId: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    setPendingId(tenantId)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error ?? "Не удалось выполнить действие")
      setPendingId(null)
      router.refresh()
    })
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {error && (
        <div className="px-4 py-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/30">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3 font-medium">Арендатор</th>
              <th className="px-4 py-3 font-medium">Размещение</th>
              <th className="px-4 py-3 font-medium text-right">Требуется</th>
              <th className="px-4 py-3 font-medium text-right">Внесено</th>
              <th className="px-4 py-3 font-medium text-right">Остаток</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const remaining = Math.max(0, Math.round((row.required - row.held) * 100) / 100)
              const busy = pendingId === row.tenantId
              return (
                <tr key={row.tenantId} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/tenants/${row.tenantId}`}
                      className="font-medium text-slate-900 dark:text-slate-100 hover:underline"
                    >
                      {row.companyName}
                    </Link>
                    {row.contractNumber && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">Договор № {row.contractNumber}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{row.placement || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.required > 0 ? formatMoney(row.required) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.held > 0 ? formatMoney(row.held) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${remaining > 0 && row.status !== "NOT_REQUIRED" && row.status !== "RETURNED" ? "font-medium text-red-600 dark:text-red-400" : "text-slate-400"}`}>
                    {row.status === "NOT_REQUIRED" || row.status === "RETURNED" ? "—" : remaining > 0 ? formatMoney(remaining) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {busy ? (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-400" />
                    ) : (
                      <div className="flex justify-end gap-2">
                        {row.status === "NOT_ISSUED" && (
                          <ActionButton onClick={() => run(row.tenantId, () => issueDepositCharge(row.tenantId))}>
                            Выставить
                          </ActionButton>
                        )}
                        {row.unpaidChargeId && (row.status === "UNPAID" || row.status === "PARTIAL") && (
                          <ActionButton
                            primary
                            onClick={() => run(row.tenantId, () => markDepositPaid(row.unpaidChargeId!))}
                          >
                            Отметить внесённым
                          </ActionButton>
                        )}
                        {row.held > 0 && (
                          <ActionButton
                            onClick={() => {
                              if (confirm(`Вернуть депозит ${formatMoney(row.held)} арендатору «${row.companyName}»?`)) {
                                run(row.tenantId, () => returnDeposit(row.tenantId))
                              }
                            }}
                          >
                            Вернуть
                          </ActionButton>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
                  Арендаторов с депозитами пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 px-3 py-1.5 text-xs font-medium text-white"
          : "rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
      }
    >
      {children}
    </button>
  )
}
