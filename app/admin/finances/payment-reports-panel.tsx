"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, CheckCircle2, Eye, FileText, ReceiptText, XCircle } from "lucide-react"
import { toast } from "sonner"
import { confirmPaymentReport, markPaymentReportDisputed, rejectPaymentReport } from "@/app/actions/tenant-payments"
import { CHARGE_TYPES, PAYMENT_METHOD_LABELS, formatMoney } from "@/lib/utils"

type CashAccount = {
  id: string
  name: string
  type: string
}

type ReportCharge = {
  id: string
  type: string
  amount: number
  period: string
  description: string | null
}

type PaymentReport = {
  id: string
  amount: number
  paymentDate: Date
  method: string
  status: string
  paymentPurpose: string | null
  note: string | null
  receiptName: string | null
  receiptMime: string | null
  receiptDataUrl: string | null
  receiptFileId: string | null
  createdAt: Date
  tenant: {
    id: string
    companyName: string
    charges: ReportCharge[]
  }
}

type Props = {
  reports: PaymentReport[]
  cashAccounts: CashAccount[]
}

export function PaymentReportsPanel({ reports, cashAccounts }: Props) {
  const [open, setOpen] = useState(true)

  if (reports.length === 0) return null

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            <ReceiptText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Арендаторы сообщили об оплате
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {reports.length} платежей ждут проверки и проведения.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
          {open ? "Свернуть" : "Показать"}
        </span>
      </button>

      {open && (
        <div className="grid gap-3 border-t border-amber-200 px-5 py-4 dark:border-amber-500/20">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} cashAccounts={cashAccounts} />
          ))}
        </div>
      )}
    </section>
  )
}

function ReportCard({
  report,
  cashAccounts,
}: {
  report: PaymentReport
  cashAccounts: CashAccount[]
}) {
  const [pending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState(report.method || "TRANSFER")
  const [selectedAccountId, setSelectedAccountId] = useState(() => defaultAccountForMethod(report.method, cashAccounts))
  const isDisputed = report.status === "DISPUTED"
  const defaultChargeIds = getDefaultChargeIds(report.amount, report.tenant.charges)

  function submitConfirm(formData: FormData) {
    startTransition(async () => {
      const result = await confirmPaymentReport(formData)
      if (result.ok) toast.success(result.message ?? "Платеж проведен")
      else toast.error(result.error ?? "Не удалось провести платеж")
    })
  }

  function submitReject(formData: FormData) {
    startTransition(async () => {
      const result = await rejectPaymentReport(formData)
      if (result.ok) {
        toast.success(result.message ?? "Заявка отклонена")
        setRejecting(false)
      } else {
        toast.error(result.error ?? "Не удалось отклонить")
      }
    })
  }

  function submitDispute() {
    const reason = window.prompt("Что нужно уточнить по оплате?")
    if (!reason?.trim()) return
    const formData = new FormData()
    formData.set("reportId", report.id)
    formData.set("reason", reason)

    startTransition(async () => {
      const result = await markPaymentReportDisputed(formData)
      if (result.ok) toast.success(result.message ?? "Оплата помечена как спорная")
      else toast.error(result.error ?? "Не удалось пометить оплату как спорную")
    })
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {report.tenant.companyName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Сообщил {new Date(report.createdAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(report.amount)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {new Date(report.paymentDate).toLocaleDateString("ru-RU")}
              </p>
              <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {PAYMENT_METHOD_LABELS[report.method] ?? report.method}
              </p>
              <p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                isDisputed
                  ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
              }`}>
                {isDisputed ? "Спорная" : "Ждет проверки"}
              </p>
            </div>
          </div>

          {report.paymentPurpose && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {report.paymentPurpose}
            </p>
          )}

          {report.note && (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{report.note}</p>
          )}

          {report.receiptFileId || report.receiptDataUrl ? (
            <a
              href={report.receiptFileId ? `/api/storage/${report.receiptFileId}` : report.receiptDataUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              download={report.receiptName ?? "receipt"}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Eye className="h-4 w-4" />
              Открыть чек
            </a>
          ) : (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <FileText className="h-4 w-4" />
              Чек не приложен
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          {rejecting ? (
            <form action={submitReject} className="space-y-3">
              <input type="hidden" name="reportId" value={report.id} />
              <label className="block">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Причина отклонения</span>
                <textarea
                  name="reason"
                  rows={3}
                  placeholder="Например: сумма не поступила на счет"
                  className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  Назад
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Отклонить
                </button>
              </div>
            </form>
          ) : (
            <form action={submitConfirm} className="space-y-3">
              <input type="hidden" name="reportId" value={report.id} />
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Метод</span>
                  <select
                    name="method"
                    value={selectedMethod}
                    onChange={(event) => {
                      const nextMethod = event.target.value
                      setSelectedMethod(nextMethod)
                      setSelectedAccountId(defaultAccountForMethod(nextMethod, cashAccounts))
                    }}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="TRANSFER">Перевод</option>
                    <option value="KASPI">Kaspi</option>
                    <option value="CASH">Наличные</option>
                    <option value="CARD">Карта</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Счет</span>
                  <select
                    name="cashAccountId"
                    value={selectedAccountId}
                    onChange={(event) => setSelectedAccountId(event.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">Не зачислять</option>
                    {cashAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {report.tenant.charges.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Закрыть начисления</p>
                  <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
                    Система заранее отмечает старые начисления, которые помещаются в сумму платежа. Нельзя закрыть долгов больше, чем поступило денег.
                  </p>
                  <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    {report.tenant.charges.map((charge) => (
                      <label key={charge.id} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <input type="checkbox" name="chargeIds" value={charge.id} defaultChecked={defaultChargeIds.has(charge.id)} className="mt-0.5 rounded" />
                        <span>
                          {CHARGE_TYPES[charge.type] ?? charge.type} · {charge.period} · {formatMoney(charge.amount)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRejecting(true)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  <XCircle className="h-4 w-4" />
                  Отклонить
                </button>
                <button
                  type="button"
                  onClick={submitDispute}
                  disabled={pending || isDisputed}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Спорная
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Провести
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </article>
  )
}

function defaultAccountForMethod(method: string, cashAccounts: CashAccount[]) {
  const preferredType = method === "CASH" ? "CASH" : method === "CARD" ? "CARD" : "BANK"
  return cashAccounts.find((account) => account.type === preferredType)?.id ?? ""
}

function getDefaultChargeIds(amount: number, charges: ReportCharge[]) {
  const selected = new Set<string>()
  let remaining = amount
  for (const charge of charges) {
    if (charge.amount <= remaining + 0.01) {
      selected.add(charge.id)
      remaining = Math.round((remaining - charge.amount) * 100) / 100
    }
  }
  return selected
}
