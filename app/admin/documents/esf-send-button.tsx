"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Landmark, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { sendActToEsf, refreshEsfStatus, sendInvoiceToEsf, refreshInvoiceEsfStatus } from "@/app/actions/esf"
import { useT } from "@/lib/i18n/client"

/**
 * Управление отправкой АВР в ИС ЭСФ (КГД): кнопка отправки, статус-бейдж,
 * обновление статуса (подтвердил ли арендатор в своём кабинете ЭСФ).
 */

const KNOWN_STATUSES = ["SENT", "CREATED", "DELIVERED", "CONFIRMED", "DECLINED", "CANCELED", "FAILED"] as const

function statusTone(status: string): string {
  if (status === "CONFIRMED") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
  if (status === "DECLINED" || status === "FAILED" || status === "CANCELED") return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
}

export function EsfControl({
  documentId,
  status,
  regNumber,
  error,
  kind = "act",
}: {
  documentId: string
  status: string | null
  regNumber: string | null
  error?: string | null
  /** Тип документа: АВР (act) или счёт-фактура ЭСФ (invoice). */
  kind?: "act" | "invoice"
}) {
  const router = useRouter()
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const docLabel = kind === "invoice" ? t("adminDocs.esf.invoiceDoc") : t("adminDocs.esf.actDoc")

  // Подпись статуса: известные — из словаря, остальные — как пришли из ИС ЭСФ.
  const statusLabel = (status: string) =>
    (KNOWN_STATUSES as readonly string[]).includes(status)
      ? t(`adminDocs.esf.statuses.${status as (typeof KNOWN_STATUSES)[number]}`)
      : t("adminDocs.esf.statusOther", { status })

  function send() {
    startTransition(async () => {
      const r = kind === "invoice" ? await sendInvoiceToEsf(documentId) : await sendActToEsf(documentId)
      if (!r.ok) { toast.error(r.error); router.refresh(); return }
      toast.success(r.regNumber
        ? t("adminDocs.esf.sentWithNumber", { doc: docLabel, number: r.regNumber })
        : t("adminDocs.esf.sent", { doc: docLabel }))
      router.refresh()
    })
  }

  function refresh() {
    startTransition(async () => {
      const r = kind === "invoice" ? await refreshInvoiceEsfStatus(documentId) : await refreshEsfStatus(documentId)
      if (!r.ok) { toast.error(r.error); return }
      const reason = "error" in r && typeof r.error === "string" ? r.error : null
      if (reason && (r.status === "FAILED" || r.status === "DECLINED")) {
        toast.error(t("adminDocs.esf.declined", { reason }))
      } else {
        toast.success(t("adminDocs.esf.statusToast", {
          status: r.status ? statusLabel(r.status) : t("adminDocs.esf.unchanged"),
        }))
      }
      router.refresh()
    })
  }

  // Ещё не отправлялся (или упал/отклонён — можно отправить заново)
  if (!status || status === "FAILED" || status === "DECLINED") {
    return (
      <span className="inline-flex items-center gap-1">
        {status && (
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-1 text-[10px] font-medium ${statusTone(status)}`}
            title={error ?? undefined}
          >
            {statusLabel(status)}
          </span>
        )}
        <button
          type="button"
          onClick={send}
          disabled={pending}
          title={kind === "invoice"
            ? t("adminDocs.esf.sendInvoiceTitle")
            : t("adminDocs.esf.sendActTitle")}
          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Landmark className="h-3 w-3" />}
          {status ? t("adminDocs.esf.resend") : t("adminDocs.esf.send")}
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center rounded-md border px-1.5 py-1 text-[10px] font-medium ${statusTone(status)}`}
        title={regNumber ? t("adminDocs.esf.regNumber", { number: regNumber }) : undefined}
      >
        {statusLabel(status)}
      </span>
      {status !== "CONFIRMED" && (
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          title={t("adminDocs.esf.refresh")}
          aria-label={t("adminDocs.esf.refresh")}
          className="inline-flex items-center rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      )}
    </span>
  )
}
