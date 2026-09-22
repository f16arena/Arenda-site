"use client"

import { useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { Banknote, CheckCircle2, Copy, MessageSquare, Send } from "lucide-react"
import { toast } from "sonner"
import { reportTenantPayment } from "@/app/actions/tenant-payments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useT, useLocale } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"
import { Card } from "@/components/ui/card"

type PaymentRequisites = {
  recipient: string
  iin: string
  accounts: {
    label: string
    bank: string
    bik: string
    account: string
    isPrimary: boolean
  }[]
}

type PaymentPanelProps = {
  requisites: PaymentRequisites
  totalDebt: number
  monthlyRent: number
  paymentPurpose: string
  qrDataUrl: string | null
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

export function PaymentPanel({
  requisites,
  totalDebt,
  monthlyRent,
  paymentPurpose,
  qrDataUrl,
}: PaymentPanelProps) {
  const [pending, startTransition] = useTransition()
  const { t } = useT()
  const locale = useLocale()
  const money = (amount: number) => formatMoneyL(locale, amount)
  const suggestedAmount = totalDebt > 0 ? totalDebt : monthlyRent

  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value)
    toast.success(t("cabinetPayment.copied", { label }))
  }

  const allRequisites = [
    `${t("domain.requisites.recipient")}: ${requisites.recipient}`,
    `${t("domain.requisites.taxId")}: ${requisites.iin}`,
    ...requisites.accounts.flatMap((account) => [
      `${account.label}:`,
      `${t("domain.requisites.bank")}: ${account.bank}`,
      `${t("domain.requisites.bik")}: ${account.bik}`,
      `${t("domain.requisites.iik")}: ${account.account}`,
    ]),
    `${t("domain.requisites.purpose")}: ${paymentPurpose}`,
  ].join("\n")

  return (
    <Card id="payment" className="block p-0">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("cabinetPayment.title")}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("cabinetPayment.subtitle")}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => copy(allRequisites, t("cabinetPayment.requisitesLabel"))}>
          <Copy className="h-4 w-4" />
          {t("cabinetPayment.copyAll")}
        </Button>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <RequisiteRow label={t("domain.requisites.recipient")} value={requisites.recipient} onCopy={copy} />
            <RequisiteRow label={t("domain.requisites.taxId")} value={requisites.iin} onCopy={copy} />
            {requisites.accounts.map((account, index) => (
              <div key={`${account.account}-${index}`} className="md:col-span-2 grid gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800 md:grid-cols-2">
                <div className="md:col-span-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {account.label}
                  </p>
                  {account.isPrimary && (
                    <Badge variant="secondary" className="bg-emerald-100 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                      {t("cabinetPayment.primaryAccount")}
                    </Badge>
                  )}
                </div>
                <RequisiteRow label={t("domain.requisites.bank")} value={account.bank} onCopy={copy} />
                <RequisiteRow label={t("domain.requisites.bik")} value={account.bik} onCopy={copy} />
                <div className="md:col-span-2">
                  <RequisiteRow label={t("domain.requisites.iik")} value={account.account} onCopy={copy} />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  {t("domain.requisites.purpose")}
                </p>
                <p className="mt-1 break-words text-sm text-blue-950 dark:text-blue-100">{paymentPurpose}</p>
              </div>
              <button
                type="button"
                onClick={() => copy(paymentPurpose, t("domain.requisites.purpose"))}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-blue-700 hover:bg-blue-100 dark:text-blue-200 dark:hover:bg-blue-500/20"
                aria-label={t("cabinetPayment.copyPurpose")}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          <form
            id="report-payment"
            action={(formData) => {
              // Чек обязателен для безналичных способов (наличные подтверждает админ).
              const method = String(formData.get("method") ?? "")
              const receipt = formData.get("receipt")
              const hasReceipt = receipt instanceof File && receipt.size > 0
              if (method !== "CASH" && !hasReceipt) {
                toast.error(t("cabinetPayment.form.receiptMissing"))
                return
              }
              startTransition(async () => {
                const result = await reportTenantPayment(formData)
                if (result.ok) toast.success(result.message ?? t("cabinetPayment.form.sent"))
                else toast.error(result.error ?? t("cabinetPayment.form.failed"))
              })
            }}
            encType="multipart/form-data"
            className="grid gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
          >
            <input type="hidden" name="paymentPurpose" value={paymentPurpose} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("cabinetPayment.form.amount")}</span>
                <Input
                  name="amount"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={Math.round(suggestedAmount)}
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("cabinetPayment.form.date")}</span>
                <Input
                  name="paymentDate"
                  type="date"
                  defaultValue={todayInputValue()}
                  className="mt-1"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("cabinetPayment.form.method")}</span>
              <select
                name="method"
                defaultValue="KASPI"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/10"
              >
                <option value="KASPI">Kaspi</option>
                <option value="TRANSFER">{t("domain.paymentMethods.TRANSFER")}</option>
                <option value="CASH">{t("domain.paymentMethods.CASH")}</option>
                <option value="CARD">{t("domain.paymentMethods.CARD")}</option>
              </select>
              <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                <Banknote className="h-3.5 w-3.5" />
                {t("cabinetPayment.form.cashHint")}
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("cabinetPayment.form.comment")}</span>
              <Textarea
                name="note"
                rows={3}
                placeholder={t("cabinetPayment.form.commentPlaceholder")}
                className="mt-1 resize-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("cabinetPayment.form.receipt")} <span className="text-red-500">{t("cabinetPayment.form.receiptRequired")}</span> {t("cabinetPayment.form.receiptExceptCash")}
              </span>
              <input
                name="receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="mt-1 block w-full cursor-pointer rounded-lg border border-slate-200 bg-white text-sm text-slate-500 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:file:bg-slate-800 dark:file:text-slate-200"
              />
              <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
                {t("cabinetPayment.form.receiptHint")}
              </span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("cabinetPayment.form.notAutoPaid")}
              </p>
              <Button type="submit" disabled={pending} className="w-full sm:w-auto">
                <Send className="h-4 w-4" />
                {t("cabinetPayment.form.submit")}
              </Button>
            </div>
          </form>
        </div>

        <aside className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="rounded-lg bg-slate-950 p-4 text-white">
            <p className="text-xs text-slate-400">{t("cabinetPayment.amountNow")}</p>
            <p className={`mt-1 text-2xl font-bold ${totalDebt > 0 ? "text-red-300" : "text-emerald-300"}`}>
              {money(totalDebt)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {t("cabinetPayment.rentReference", { amount: money(monthlyRent) })}
            </p>
          </div>

          {qrDataUrl && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-center dark:border-slate-700">
              <Image
                src={qrDataUrl}
                alt={t("cabinetPayment.qrAlt")}
                width={180}
                height={180}
                className="mx-auto h-[180px] w-[180px]"
                unoptimized
              />
              <p className="mt-2 text-xs text-slate-500">
                {t("cabinetPayment.qrHint")}
              </p>
            </div>
          )}

          <Link
            href="/cabinet/messages"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <MessageSquare className="h-4 w-4" />
            {t("cabinetPayment.writeAdmin")}
          </Link>
        </aside>
      </div>
    </Card>
  )
}

function RequisiteRow({
  label,
  value,
  onCopy,
}: {
  label: string
  value: string
  onCopy: (value: string, label: string) => void
}) {
  const { t } = useT()
  const copyLabel = t("cabinetPayment.copyField", { label })
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 break-words text-sm font-medium text-slate-900 dark:text-slate-100">{value}</p>
        </div>
        <button
          type="button"
          onClick={() => onCopy(value, label)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label={copyLabel}
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
