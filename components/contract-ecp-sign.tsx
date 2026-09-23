"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { signWithNCALayer, type KeyStoragePref } from "@/lib/ncalayer"
import { signContractByTenantEcp, signContractByLandlordEcp } from "@/app/actions/contract-workflow"
import { NcaKeyTypeSelect } from "@/components/nca-key-type-select"
import { useT } from "@/lib/i18n/client"

type Phase = "idle" | "signing" | "saving" | "done" | "error"

interface Props {
  /** base64 канонического текста договора (его подписывает NCALayer) */
  payloadB64: string
  /** Кто подписывает */
  mode: "tenant" | "landlord"
  /** Для арендатора — токен ссылки */
  token?: string
  /** Для арендодателя — id договора */
  contractId?: string
  label?: string
  onSigned?: () => void
}

/**
 * Подписание договора квалифицированной ЭЦП НУЦ РК через NCALayer.
 * Десктоп-приложение NCALayer должно быть установлено и запущено.
 */
export function ContractEcpSign({ payloadB64, mode, token, contractId, label, onSigned }: Props) {
  const { t } = useT()
  const signLabel = label ?? t("common.sign.signEcp")
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [keyPref, setKeyPref] = useState<KeyStoragePref>("file")

  async function handleSign() {
    setError(null)
    setPhase("signing")
    try {
      const result = await signWithNCALayer(payloadB64, "cms", { tsp: true, storage: keyPref })
      if (!result.ok) {
        const msg = result.error || t("common.sign.ncaNoSignatureLong")
        setError(msg)
        setPhase("error")
        toast.error(msg)
        if (/NCALayer/i.test(msg)) setShowHelp(true)
        return
      }

      setPhase("saving")
      const saved =
        mode === "tenant"
          ? await signContractByTenantEcp(token ?? "", result.signature)
          : await signContractByLandlordEcp(contractId ?? "", result.signature)

      if (!saved.ok) {
        // Здесь приходят важные причины: ИИН/БИН не совпал, сертификат истёк,
        // подпись не соответствует тексту, не прошла криптопроверку НУЦ РК.
        const msg = saved.error || t("common.sign.saveSignatureFailed")
        setError(msg)
        setPhase("error")
        toast.error(msg)
        return
      }

      setPhase("done")
      toast.success(t("common.sign.signedContract"))
      onSigned?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPhase("error")
      toast.error(msg)
    }
  }

  const isWorking = phase === "signing" || phase === "saving"

  if (phase === "done") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4" /> {t("common.sign.signedEcp")}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <NcaKeyTypeSelect value={keyPref} onChange={setKeyPref} disabled={isWorking} />
      <button
        type="button"
        onClick={handleSign}
        disabled={isWorking}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 px-4 py-2.5 text-sm font-semibold text-white transition"
      >
        {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {phase === "signing" && t("common.sign.confirmInNca")}
        {phase === "saving" && t("common.sign.savingSignature")}
        {(phase === "idle" || phase === "error") && signLabel}
      </button>

      {phase === "error" && error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        {t("common.sign.needNca")}{" "}
        <button type="button" onClick={() => setShowHelp((v) => !v)} className="text-blue-600 hover:underline">
          {showHelp ? t("common.sign.hide") : t("common.sign.whatIsThis")}
        </button>
      </p>

      {showHelp && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900 max-w-sm dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-200">
          <p className="font-medium mb-1">{t("common.sign.ncaTitle")}</p>
          <p>
            {t("common.sign.ncaHelp1")}{" "}
            <a href="https://pki.gov.kz/ncalayer/" target="_blank" rel="noopener" className="underline">
              pki.gov.kz/ncalayer
            </a>{" "}
            {t("common.sign.ncaHelp2", { label: signLabel })}
          </p>
        </div>
      )}
    </div>
  )
}
