"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { getSignedContractDocxByToken } from "@/app/actions/contract-workflow"

/** Скачивание подписанного договора (DOCX со штампами ЭЦП) по токену — после подписи обеих сторон. */
export function DownloadSigned({ token }: { token: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function download() {
    setBusy(true); setErr(null)
    try {
      const r = await getSignedContractDocxByToken(token)
      if (!r.ok) { setErr(r.error); return }
      const bin = atob(r.base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = r.fileName
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка скачивания")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-white transition"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Скачать подписанный договор (DOCX)
      </button>
      {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>}
    </div>
  )
}
