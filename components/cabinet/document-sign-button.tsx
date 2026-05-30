"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ShieldCheck, Loader2 } from "lucide-react"
import { signWithNCALayer, fetchAsBase64 } from "@/lib/ncalayer"
import { signIssuedDocumentEcp, signIssuedDocumentSimple } from "@/app/actions/cabinet-signatures"

/** Подпись выставленного арендодателем акта (АВР / сверка) арендатором: ЭЦП или простая. */
export function DocumentSignButton({ documentId }: { documentId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<"ecp" | "simple" | null>(null)

  async function signEcp() {
    setBusy("ecp")
    try {
      const fileB64 = await fetchAsBase64(`/api/documents/archive/${documentId}`)
      const res = await signWithNCALayer(fileB64, "cms")
      if (!res.ok) { toast.error(res.error); return }
      const saved = await signIssuedDocumentEcp(documentId, res.signature)
      if (!saved.ok) { toast.error(saved.error ?? "Не удалось подписать"); return }
      toast.success("Документ подписан ЭЦП")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка подписи")
    } finally { setBusy(null) }
  }

  async function signSimple() {
    setBusy("simple")
    try {
      const r = await signIssuedDocumentSimple(documentId)
      if (!r.ok) { toast.error(r.error ?? "Не удалось подписать"); return }
      toast.success("Документ подписан")
      router.refresh()
    } finally { setBusy(null) }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={signEcp}
        disabled={!!busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy === "ecp" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        Подписать ЭЦП
      </button>
      <button type="button" onClick={signSimple} disabled={!!busy} className="text-xs text-slate-500 hover:underline dark:text-slate-400 disabled:opacity-50">
        без ЭЦП
      </button>
    </div>
  )
}
