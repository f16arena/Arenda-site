"use client"

import { useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FileText, Loader2, ShieldCheck, Download, ExternalLink, X } from "lucide-react"
import { getContractCard, setContractSignatureManual, type ContractCardData } from "@/app/actions/contract-card"
import { ModalShell } from "@/components/ui/modal"
import { useT, useLocale } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"

/**
 * Кнопка «Карточка» договора → окно с условиями и статусом подписи.
 *
 * Окно — общая оболочка ModalShell (портал в <body>, Esc, фокус внутри).
 * Своё «fixed inset-0» здесь не работало: кнопка живёт внутри меню «⋯», а у
 * выпадающего меню есть transform — из-за него fixed считался не от экрана, а
 * от меню шириной 208 px, и окно сплющивалось у правого края, а подписи
 * наезжали друг на друга.
 */
export function ContractCardButton({ contractId }: { contractId: string }) {
  const { t } = useT()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ContractCardData | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  async function openCard() {
    setOpen(true)
    setLoading(true)
    const res = await getContractCard(contractId)
    setLoading(false)
    if (res.ok) setData(res.data)
    else { toast.error(res.error); setOpen(false) }
  }

  function setSign(landlord: boolean, tenant: boolean) {
    if (!data || pending) return
    startTransition(async () => {
      const res = await setContractSignatureManual(data.id, landlord, tenant)
      if (res.ok) {
        setData({ ...data, signedByLandlord: landlord, signedByTenant: tenant })
        toast.success(t("adminDocs.card.signUpdated"))
        router.refresh()
      } else toast.error(res.error ?? t("adminDocs.card.saveFailed"))
    })
  }

  const money = (amount: number) => formatMoneyL(locale, amount)
  // formatMoneyL уже даёт «120 000 ₸» — знак валюты вручную не дописываем.
  const rentText = data?.monthlyRent
    ? `${money(data.monthlyRent)}${t("common.money.perMonth")}${
        data.rentMode === "RATE" && data.customRate ? ` ${t("adminDocs.card.rate", { rate: money(data.customRate) })}` : ""
      }`
    : "—"

  return (
    <>
      <button
        type="button"
        onClick={openCard}
        title={t("adminDocs.card.buttonTitle")}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <FileText className="h-3.5 w-3.5" /> {t("adminDocs.card.button")}
      </button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        title={t("adminDocs.card.title", { number: data?.number ?? "" })}
        className="flex w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("adminDocs.card.title", { number: data?.number ?? "" })}
            </h3>
            <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
              {data?.isExternal ? t("adminDocs.card.external") : t("adminDocs.card.internal")}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {loading || !data ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Row label={t("adminDocs.card.tenant")} value={data.tenantName} full />
                <Row label={t("adminDocs.card.term")} value={data.startDate ? `${data.startDate} – ${data.endDate ?? "…"}` : "—"} full />
                <Row label={t("adminDocs.card.rent")} value={rentText} />
                <Row label={t("adminDocs.card.deposit")} value={data.deposit ? money(data.deposit) : t("adminDocs.card.none")} />
                <Row label={t("adminDocs.card.serviceFee")} value={data.serviceFeeExempt ? t("adminDocs.card.serviceFeeOff") : t("adminDocs.card.serviceFeeOn")} />
                <Row label={t("adminDocs.card.dueDay")} value={data.paymentDueDay ? t("adminDocs.card.dueDayValue", { day: data.paymentDueDay }) : "—"} />
                <Row label={t("adminDocs.card.penalty")} value={data.penaltyPercent ? t("adminDocs.card.penaltyValue", { percent: data.penaltyPercent }) : t("adminDocs.card.none")} />
                <Row label={t("adminDocs.card.indexation")} value={data.indexationPct ? t("adminDocs.card.indexationValue", { percent: data.indexationPct }) : t("adminDocs.card.none")} />
                <Row label={t("adminDocs.card.spaces")} value={data.spaces.length ? data.spaces.join(", ") : t("adminDocs.card.spacesEmpty")} full />
                {data.signedAt && <Row label={t("adminDocs.card.signedAt")} value={data.signedAt} full />}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" /> {t("adminDocs.card.signTitle")}
                </p>
                <div className="mt-3 space-y-2">
                  <SignRow label={t("adminDocs.card.landlord")} signed={data.signedByLandlord} canManage={data.canManage} disabled={pending} onToggle={(v) => setSign(v, data.signedByTenant)} />
                  <SignRow label={t("adminDocs.card.tenant")} signed={data.signedByTenant} canManage={data.canManage} disabled={pending} onToggle={(v) => setSign(data.signedByLandlord, v)} />
                </div>
                {data.canManage && !(data.signedByLandlord && data.signedByTenant) && (
                  <button
                    type="button"
                    onClick={() => setSign(true, true)}
                    disabled={pending}
                    className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {pending ? t("common.actions.saving") : t("adminDocs.card.markBoth")}
                  </button>
                )}
                {!data.canManage && (
                  <p className="mt-2 text-[11px] text-slate-400">{t("adminDocs.card.cantManage")}</p>
                )}
              </div>

              <div className="flex gap-2">
                {data.isExternal && data.attachmentFileId ? (
                  <a href={`/api/storage/${data.attachmentFileId}`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    <Download className="h-4 w-4" /> {t("adminDocs.card.downloadPdf")}
                  </a>
                ) : (
                  <Link href={`/admin/contracts/${data.id}`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    <ExternalLink className="h-4 w-4" /> {t("adminDocs.card.openContract")}
                  </Link>
                )}
                <Link href={`/admin/tenants/${data.tenantId}`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                  {t("adminDocs.card.tenantCard")}
                </Link>
              </div>
            </>
          )}
        </div>
      </ModalShell>
    </>
  )
}

function Row({ label, value, full }: { label: string; value: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  )
}

function SignRow({ label, signed, canManage, disabled, onToggle }: { label: string; signed: boolean; canManage: boolean; disabled: boolean; onToggle: (v: boolean) => void }) {
  const { t } = useT()
  return (
    <label className={`flex items-center justify-between gap-3 ${canManage ? "cursor-pointer" : ""}`}>
      <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
      {canManage ? (
        <input type="checkbox" checked={signed} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
      ) : (
        <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${signed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
          {signed ? t("adminDocs.card.signedYes") : t("adminDocs.card.signedNo")}
        </span>
      )}
    </label>
  )
}
