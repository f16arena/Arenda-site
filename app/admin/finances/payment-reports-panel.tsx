"use client"
import { askText } from "@/components/ui/dialog-host"

import { useState, useTransition } from "react"
import { AlertTriangle, CheckCircle2, Eye, FileText, ReceiptText, XCircle } from "lucide-react"
import { toast } from "sonner"
import { confirmPaymentReport, markPaymentReportDisputed, rejectPaymentReport } from "@/app/actions/tenant-payments"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import { INTL_LOCALE } from "@/lib/i18n/config"

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
  const { t, tp } = useT()
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
              {t("adminFinance.reports.title")}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tp("adminFinance.reports.subtitle", reports.length)}
            </p>
          </div>
        </div>
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
          {open ? t("adminFinance.reports.collapse") : t("adminFinance.reports.expand")}
        </Badge>
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
  const { t } = useT()
  const locale = useLocale()
  const [pending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState(report.method || "TRANSFER")
  const [selectedAccountId, setSelectedAccountId] = useState(() => defaultAccountForMethod(report.method, cashAccounts))
  const isDisputed = report.status === "DISPUTED"
  const defaultChargeIds = getDefaultChargeIds(report.amount, report.tenant.charges)
  const money = (amount: number) => formatMoneyL(locale, amount)
  const methodLabel = (method: string) => {
    const key = `domain.paymentMethods.${method}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? method : label
  }
  const chargeTypeLabel = (type: string) => {
    const key = `domain.chargeTypes.${type}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? type : label
  }

  function submitConfirm(formData: FormData) {
    startTransition(async () => {
      const result = await confirmPaymentReport(formData)
      if (result.ok) toast.success(result.message ?? t("adminFinance.reports.confirmed"))
      else toast.error(result.error ?? t("adminFinance.reports.confirmFailed"))
    })
  }

  function submitReject(formData: FormData) {
    startTransition(async () => {
      const result = await rejectPaymentReport(formData)
      if (result.ok) {
        toast.success(result.message ?? t("adminFinance.reports.rejected"))
        setRejecting(false)
      } else {
        toast.error(result.error ?? t("adminFinance.reports.rejectFailed"))
      }
    })
  }

  async function submitDispute() {
    const reason = await askText({
      title: t("adminFinance.reports.disputeTitle"),
      label: t("adminFinance.reports.disputeLabel"),
      confirmLabel: t("adminFinance.reports.disputeSend"),
    })
    if (!reason?.trim()) return
    const formData = new FormData()
    formData.set("reportId", report.id)
    formData.set("reason", reason)

    startTransition(async () => {
      const result = await markPaymentReportDisputed(formData)
      if (result.ok) toast.success(result.message ?? t("adminFinance.reports.disputedDone"))
      else toast.error(result.error ?? t("adminFinance.reports.disputeFailed"))
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
                {t("adminFinance.reports.reportedAt", {
                  datetime: new Date(report.createdAt).toLocaleString(INTL_LOCALE[locale], {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{money(report.amount)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatDateShortL(locale, report.paymentDate)}
              </p>
              <Badge className="mt-1 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {methodLabel(report.method)}
              </Badge>
              <Badge className={`mt-1 ${
                isDisputed
                  ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
              }`}>
                {isDisputed ? t("adminFinance.reports.disputed") : t("adminFinance.reports.checking")}
              </Badge>
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
              {t("adminFinance.reports.openReceipt")}
            </a>
          ) : (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <FileText className="h-4 w-4" />
              {t("adminFinance.reports.noReceipt")}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          {rejecting ? (
            <form action={submitReject} className="space-y-3">
              <input type="hidden" name="reportId" value={report.id} />
              <label className="block">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.reports.rejectReason")}</span>
                <Textarea
                  name="reason"
                  rows={3}
                  placeholder={t("adminFinance.reports.rejectPlaceholder")}
                  className="mt-1 resize-none"
                />
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRejecting(false)}
                  className="flex-1"
                >
                  {t("common.actions.back")}
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={pending}
                  className="flex-1"
                >
                  {t("adminFinance.reports.reject")}
                </Button>
              </div>
            </form>
          ) : (
            <form action={submitConfirm} className="space-y-3">
              <input type="hidden" name="reportId" value={report.id} />
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.reports.method")}</span>
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
                    <option value="TRANSFER">{t("domain.paymentMethods.TRANSFER")}</option>
                    <option value="KASPI">{t("domain.paymentMethods.KASPI")}</option>
                    <option value="CASH">{t("domain.paymentMethods.CASH")}</option>
                    <option value="CARD">{t("domain.paymentMethods.CARD")}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.reports.account")}</span>
                  <select
                    name="cashAccountId"
                    value={selectedAccountId}
                    onChange={(event) => setSelectedAccountId(event.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">{t("adminFinance.reports.accountNone")}</option>
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
                  <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.reports.closeCharges")}</p>
                  <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
                    {t("adminFinance.reports.closeChargesHint")}
                  </p>
                  <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    {report.tenant.charges.map((charge) => (
                      <label key={charge.id} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <input type="checkbox" name="chargeIds" value={charge.id} defaultChecked={defaultChargeIds.has(charge.id)} className="mt-0.5 rounded" />
                        <span>
                          {chargeTypeLabel(charge.type)} · {charge.period} · {money(charge.amount)}
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
                  {t("adminFinance.reports.reject")}
                </button>
                <button
                  type="button"
                  onClick={submitDispute}
                  disabled={pending || isDisputed}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {t("adminFinance.reports.dispute")}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {t("adminFinance.reports.confirm")}
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
