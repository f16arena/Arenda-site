"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { signWithNCALayer, fetchAsBase64, sha256Base64 } from "@/lib/ncalayer"
import { saveSignature } from "@/app/actions/signatures"

interface Props {
  documentUrl: string         // URL для скачивания DOCX/PDF (например, /api/contracts/generate?...)
  documentType: "CONTRACT" | "INVOICE" | "ACT" | "RECONCILIATION" | "HANDOVER"
  documentId?: string         // ID связанной сущности (Contract.id и т.п.)
  documentRef?: string        // Альтернативно — строковый референс
  label?: string              // Текст кнопки (по умолчанию "Подписать ЭЦП")
  onSigned?: () => void       // Callback после успешной подписи
}

type Phase = "idle" | "downloading" | "hashing" | "signing" | "saving" | "done" | "error"

export function NcaSignButton({ documentUrl, documentType, documentId, documentRef, label = "Подписать ЭЦП", onSigned }: Props) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  async function handleSign() {
    setError(null)
    setPhase("downloading")
    try {
      const fileB64 = await fetchAsBase64(documentUrl)

      setPhase("hashing")
      const hashB64 = await sha256Base64(Uint8Array.from(atob(fileB64), (c) => c.charCodeAt(0)).buffer as ArrayBuffer)

      setPhase("signing")
      const result = await signWithNCALayer(fileB64, "cms")
      if (!result.ok) {
        setError(result.error)
        setPhase("error")
        toast.error(result.error)
        if (result.code === undefined && /NCALayer/.test(result.error)) {
          setShowHelp(true)
        }
        return
      }

      setPhase("saving")
      const saved = await saveSignature({
        documentType,
        documentId,
        documentRef,
        signedHashB64: hashB64,
        signatureB64: result.signature,
        certPemB64: result.signerCert,
      })
      if (!saved.ok) {
        setError(saved.error ?? "Не удалось сохранить")
        setPhase("error")
        toast.error(saved.error ?? "Не удалось сохранить подпись")
        return
      }

      setPhase("done")
      toast.success("Документ подписан ЭЦП")
      onSigned?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPhase("error")
      toast.error(msg)
    }
  }

  const isWorking = phase === "downloading" || phase === "hashing" || phase === "signing" || phase === "saving"

  return (
    <div className="inline-flex flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={handleSign}
        disabled={isWorking || phase === "done"}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 px-4 py-2 text-sm font-medium text-white transition print:hidden"
      >
        {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> :
         phase === "done" ? <CheckCircle2 className="h-4 w-4" /> :
         <ShieldCheck className="h-4 w-4" />}
        {phase === "downloading" && "Скачиваем документ…"}
        {phase === "hashing" && "Хешируем…"}
        {phase === "signing" && "Введите PIN в NCALayer…"}
        {phase === "saving" && "Сохраняем…"}
        {phase === "done" && "Подписано"}
        {(phase === "idle" || phase === "error") && label}
      </button>

      {phase === "error" && error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 max-w-xs print:hidden">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
          {showHelp && (
            <p className="mt-2 text-[10px] text-red-600">
              Установите NCALayer с{" "}
              <a href="https://pki.gov.kz/ncalayer/" target="_blank" rel="noopener" className="underline">pki.gov.kz/ncalayer</a>
              , запустите его (значок в трее) и нажмите Подписать снова.
            </p>
          )}
        </div>
      )}

      {phase === "idle" && (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-xs print:hidden">
          Требуется NCALayer.{" "}
          <button type="button" onClick={() => setShowHelp((v) => !v)} className="text-blue-600 hover:underline">
            {showHelp ? "Скрыть" : "Что это?"}
          </button>
        </p>
      )}

      {showHelp && phase === "idle" && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900 max-w-sm print:hidden">
          <p className="font-medium mb-1">NCALayer</p>
          <p>Государственная программа для работы с ЭЦП НУЦ РК. Скачайте на{" "}
            <a href="https://pki.gov.kz/ncalayer/" target="_blank" rel="noopener" className="underline">pki.gov.kz/ncalayer</a>{" "}
            и запустите. После этого нажмите «Подписать ЭЦП» — выберите свой сертификат и введите PIN.
          </p>
        </div>
      )}
    </div>
  )
}
