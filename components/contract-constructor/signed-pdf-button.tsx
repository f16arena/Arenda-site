"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Download, Loader2 } from "lucide-react"
import { generateSignedContractPdf } from "@/app/actions/contract-builder"

/** Скачать подписанный договор строго в PDF (с QR на /verify/{id}). Word не отдаём. */
export function SignedPdfButton({ contractId }: { contractId: string }) {
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      const r = await generateSignedContractPdf(contractId)
      if (!r.ok || !r.base64) {
        toast.error(r.error ?? "Не удалось сформировать PDF")
        return
      }
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = r.fileName ?? "Договор.pdf"
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
      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Скачать PDF
    </button>
  )
}
