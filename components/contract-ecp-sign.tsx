"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { signWithNCALayer } from "@/lib/ncalayer"
import { signContractByTenantEcp, signContractByLandlordEcp } from "@/app/actions/contract-workflow"

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
export function ContractEcpSign({ payloadB64, mode, token, contractId, label = "Подписать ЭЦП", onSigned }: Props) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  async function handleSign() {
    setError(null)
    setPhase("signing")
    try {
      const result = await signWithNCALayer(payloadB64, "cms", { tsp: true })
      if (!result.ok) {
        const msg = result.error || "NCALayer не вернул подпись (неизвестная ошибка)"
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
        const msg = saved.error || "Не удалось сохранить подпись (причина не указана)"
        setError(msg)
        setPhase("error")
        toast.error(msg)
        return
      }

      setPhase("done")
      toast.success("Договор подписан ЭЦП")
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
      <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Подписано ЭЦП
      </div>
    )
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <button
        type="button"
        onClick={handleSign}
        disabled={isWorking}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 px-4 py-2.5 text-sm font-semibold text-white transition"
      >
        {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {phase === "signing" && "Подтвердите в NCALayer…"}
        {phase === "saving" && "Сохраняем подпись…"}
        {(phase === "idle" || phase === "error") && label}
      </button>

      {phase === "error" && error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Требуется NCALayer на компьютере.{" "}
        <button type="button" onClick={() => setShowHelp((v) => !v)} className="text-blue-600 hover:underline">
          {showHelp ? "Скрыть" : "Что это?"}
        </button>
      </p>

      {showHelp && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900 max-w-sm">
          <p className="font-medium mb-1">ЭЦП через NCALayer</p>
          <p>
            Государственная программа НУЦ РК для подписания. Скачайте на{" "}
            <a href="https://pki.gov.kz/ncalayer/" target="_blank" rel="noopener" className="underline">
              pki.gov.kz/ncalayer
            </a>{" "}
            и запустите (значок в трее). Затем нажмите «{label}», выберите свой ключ (файл) и введите пароль.
            Работает только на компьютере, не на телефоне.
          </p>
        </div>
      )}
    </div>
  )
}
