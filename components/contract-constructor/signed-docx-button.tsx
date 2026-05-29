"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Download, Loader2 } from "lucide-react"
import { generateSignedContractDocx } from "@/app/actions/contract-builder"

/** Скачать DOCX подписанного договора с реальным QR-кодом на /verify/{id}. */
export function SignedDocxButton({ contractId }: { contractId: string }) {
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      const r = await generateSignedContractDocx(contractId)
      if (!r.ok || !r.base64) {
        toast.error(r.error ?? "Не удалось сформировать DOCX")
        return
      }
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = r.fileName ?? "Договор.docx"
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      DOCX с QR-кодом
    </button>
  )
}
