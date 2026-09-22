export const dynamic = "force-dynamic"

import { assertTenantBuildingAccess } from "@/lib/building-access"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, FileClock } from "lucide-react"
import { requireOrgAccess } from "@/lib/org"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { paymentScope } from "@/lib/tenant-scope"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { moneyWithWords } from "@/lib/contract-engine/numerals"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatDateL, formatDateShortL, taxIdLabelL } from "@/lib/i18n/format"
import { formatPersonShortName } from "@/lib/display-name"
import { CabinetPrintButton } from "@/app/cabinet/documents/print/print-button"
import { ConfirmReceiptButton } from "./confirm-receipt-button"

/**
 * Печатная квитанция о приёме наличных (расписка). Арендодатель отдаёт
 * арендатору, заплатившему наличными, как подтверждение факта оплаты.
 * Печатается/сохраняется в PDF через window.print().
 */
export default async function CashReceiptPrint({
  params,
}: {
  params: Promise<{ paymentId: string }>
}) {
  const { paymentId } = await params
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT" && !session.user.isPlatformOwner) {
    redirect("/admin")
  }
  const { orgId } = await requireOrgAccess()
  const locale = await getLocale()
  const { t } = await getT(locale)
  const methodLabel = (method: string) => {
    const key = `domain.paymentMethods.${method}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? method : label
  }
  const caps = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: !!session.user.isPlatformOwner,
    orgId,
  }))
  const canConfirm = caps.has("finance.cashPayment")

  const payment = await db.payment.findFirst({
    where: { AND: [{ id: paymentId }, paymentScope(orgId)] },
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      method: true,
      note: true,
      receiptConfirmedAt: true,
      receiptConfirmedBy: { select: { name: true } },
      tenantId: true,
      tenant: {
        select: {
          companyName: true,
          legalType: true,
          bin: true,
          iin: true,
          directorName: true,
        },
      },
    },
  })
  if (!payment) notFound()
  try { await assertTenantBuildingAccess(payment.tenantId, orgId) } catch { notFound() }

  const landlord = orgId ? await getOrganizationRequisites(orgId) : null
  const tenant = payment.tenant
  const receiptNo = payment.id.slice(-6).toUpperCase()
  const dateStr = formatDateL(locale, payment.paymentDate)
  const tenantTaxId = tenant.bin
    ? t("adminFinance.receipt.taxIdBin", { value: tenant.bin })
    : tenant.iin
      ? t("adminFinance.receipt.taxIdIin", { value: tenant.iin })
      : null
  const basis = payment.note?.trim() || t("adminFinance.receipt.basisDefault")
  const isCash = payment.method === "CASH"
  const isConfirmed = !!payment.receiptConfirmedAt
  const confirmerName = formatPersonShortName(payment.receiptConfirmedBy?.name, "")
  const confirmedDate = payment.receiptConfirmedAt
    ? formatDateShortL(locale, payment.receiptConfirmedAt)
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/finances"
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("adminFinance.receipt.title")}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {isConfirmed ? t("adminFinance.receipt.subtitleReady") : t("adminFinance.receipt.subtitleDraft")}
            </p>
          </div>
        </div>
        {isCash && (isConfirmed ? <CabinetPrintButton /> : canConfirm ? <ConfirmReceiptButton paymentId={payment.id} /> : null)}
      </div>

      {!isCash && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 print:hidden">
          {t("adminFinance.receipt.notCash", { method: methodLabel(payment.method) })}
        </div>
      )}

      {isCash && !isConfirmed && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 print:hidden">
          <FileClock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t("adminFinance.receipt.draftWarning")}</span>
        </div>
      )}

      <div className="receipt-area mx-auto max-w-[760px] rounded-xl border border-slate-200 bg-white p-8 text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold">{t("adminFinance.receipt.heading")}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {t("adminFinance.receipt.number", { number: receiptNo, date: dateStr })}
          </p>
        </div>

        {isConfirmed ? (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              {confirmerName
                ? t("adminFinance.receipt.confirmedBy", { name: confirmerName })
                : t("adminFinance.receipt.confirmedPlain")}
              {confirmedDate ? ` · ${confirmedDate}` : ""}
            </span>
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
            {t("adminFinance.receipt.draftBadge")}
          </div>
        )}

        <div className="space-y-4 text-sm leading-relaxed">
          <ReceiptRow label={t("adminFinance.receipt.recipient")}>
            {landlord?.fullName || "—"}
            {landlord?.taxId ? `, ${taxIdLabelL(locale, landlord.taxIdLabel)} ${landlord.taxId}` : ""}
          </ReceiptRow>

          <ReceiptRow label={t("adminFinance.receipt.receivedFrom")}>
            {tenant.companyName}
            {tenantTaxId ? `, ${tenantTaxId}` : ""}
          </ReceiptRow>

          <ReceiptRow label={t("adminFinance.receipt.basis")}>{basis}</ReceiptRow>

          <ReceiptRow label={t("adminFinance.receipt.method")}>{t("adminFinance.receipt.methodCash")}</ReceiptRow>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 mt-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("adminFinance.receipt.amount")}</p>
            <p className="text-2xl font-bold mt-1">{moneyWithWords(payment.amount)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mt-12 text-sm">
          <div className="text-center">
            <div className="border-t border-slate-400 pt-2">
              <p className="font-medium">{t("adminFinance.receipt.signTenant")}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">{t("adminFinance.receipt.signLine")}</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-slate-400 pt-2">
              <p className="font-medium">{t("adminFinance.receipt.signLandlord")}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {confirmerName || landlord?.directorShort || ""}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t("adminFinance.receipt.stamp")}</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          aside, header { display: none !important; }
          .receipt-area { border: none !important; box-shadow: none !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  )
}

function ReceiptRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <span className="shrink-0 text-slate-500 dark:text-slate-400 sm:w-52">{label}:</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}
