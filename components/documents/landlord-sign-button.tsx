"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ShieldCheck, Loader2 } from "lucide-react"
import { signWithNCALayer, fetchAsBase64, type KeyStoragePref } from "@/lib/ncalayer"
import { signIssuedDocumentByLandlordEcp } from "@/app/actions/landlord-signatures"
import { NcaKeyTypeSelect } from "@/components/nca-key-type-select"

/** Подпись выставленного акта (АВР / Акт сверки / Счёт) АРЕНДОДАТЕЛЕМ через ЭЦП НУЦ РК. */
export function LandlordSignButton({ documentId }: { documentId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [keyPref, setKeyPref] = useState<KeyStoragePref>("file")

  async function signEcp() {
    setBusy(true)
    try {
      const fileB64 = await fetchAsBase64(`/api/documents/archive/${documentId}`)
      const res = await signWithNCALayer(fileB64, "cms", { tsp: true, storage: keyPref })
      if (!res.ok) { toast.error(res.error || "NCALayer не вернул подпись"); return }
      const saved = await signIssuedDocumentByLandlordEcp(documentId, res.signature)
      if (!saved.ok) { toast.error(saved.error ?? "Не удалось подписать"); return }
      toast.success("Документ подписан ЭЦП")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка подписи")
    } finally { setBusy(false) }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <NcaKeyTypeSelect value={keyPref} onChange={setKeyPref} disabled={busy} />
      <button
        type="button"
        onClick={signEcp}
        disabled={busy}
        title="Подписать документ своей ЭЦП (НУЦ РК)"
        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
        Подписать ЭЦП
      </button>
    </span>
  )
}
