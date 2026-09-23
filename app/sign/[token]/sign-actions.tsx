"use client"

import { useState, useTransition } from "react"
import { Check, X, ShieldCheck } from "lucide-react"
import { rejectContractByTenant } from "@/app/actions/contract-workflow"
import { Button } from "@/components/ui/button"
import { ContractEcpSign } from "@/components/contract-ecp-sign"
import { EgovQrSign } from "@/components/egov-qr-sign"
import { useT } from "@/lib/i18n/client"

export function SignActions({ token, payloadB64, egovApi1Url }: { token: string; payloadB64?: string; egovApi1Url?: string | null }) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [done, setDone] = useState<"signed" | "rejected" | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const submitReject = () => {
    if (rejectReason.trim().length < 5) { setErr(t("auth.sign.reasonTooShort")); return }
    setErr(null)
    startTransition(async () => {
      const r = await rejectContractByTenant(token, rejectReason)
      if (r.ok) setDone("rejected")
      else setErr(r.error)
    })
  }

  if (done === "signed") {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-emerald-900">{t("auth.sign.signedTitle")}</h2>
        <p className="text-sm text-emerald-700 mt-1">
          {t("auth.sign.signedText")}
        </p>
      </div>
    )
  }

  if (done === "rejected") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
          <X className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-red-900">{t("auth.sign.rejectedTitle")}</h2>
        <p className="text-sm text-red-700 mt-1">
          {t("auth.sign.rejectedDoneText")}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-semibold text-slate-900">{t("auth.sign.signTitle")}</h2>
      </div>

      <p className="text-sm text-slate-600">
        {t("auth.sign.signHint")}
      </p>

      {!payloadB64 ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          {t("auth.sign.prepareFailed")}
        </div>
      ) : (
        <div className="space-y-3">
          <ContractEcpSign
            payloadB64={payloadB64}
            mode="tenant"
            token={token}
            label={t("auth.sign.signNcalayer")}
            onSigned={() => setDone("signed")}
          />
          {egovApi1Url && (
            <>
              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs text-slate-400">{t("auth.sign.or")}</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>
              <EgovQrSign api1Url={egovApi1Url} token={token} onSigned={() => setDone("signed")} />
            </>
          )}
          <button
            onClick={() => setShowReject((v) => !v)}
            disabled={pending}
            className="w-full rounded-lg border border-red-200 hover:bg-red-50 text-red-600 py-2.5 text-sm font-medium"
          >
            {t("auth.sign.reject")}
          </button>
        </div>
      )}

      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>
      )}

      {showReject && (
        <div className="border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-700 mb-2">{t("auth.sign.rejectReason")}</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t("auth.sign.rejectPlaceholder")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none resize-none"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setShowReject(false)}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600"
            >
              {t("auth.sign.back")}
            </button>
            <Button
              variant="danger"
              onClick={submitReject}
              loading={pending}
              disabled={rejectReason.length < 5}
              className="flex-1 font-medium"
            >
              {pending ? "..." : t("auth.sign.reject")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
