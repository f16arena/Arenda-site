"use client"
import { askConfirm } from "@/components/ui/dialog-host"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload, Loader2, Trash2 } from "lucide-react"
import { uploadMyDocument, deleteMyDocument } from "@/app/actions/cabinet-docs"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/client"

// Типы документов: массив держит код, подпись берётся из словаря.
const DOC_TYPES = [
  { value: "OTHER", labelKey: "common.myDocs.types.OTHER" },
  { value: "ID", labelKey: "common.myDocs.types.ID" },
  { value: "REGISTRATION", labelKey: "common.myDocs.types.REGISTRATION" },
  { value: "POWER_OF_ATTORNEY", labelKey: "common.myDocs.types.POWER_OF_ATTORNEY" },
  { value: "CONTRACT", labelKey: "common.myDocs.types.CONTRACT" },
] as const

/** Кнопка «Загрузить» + форма загрузки документа арендатором в свой кабинет. */
export function MyDocumentUpload() {
  const { t } = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const file = fd.get("file")
    if (!(file instanceof File) || file.size === 0) { toast.error(t("common.myDocs.attachFile")); return }
    setBusy(true)
    try {
      const r = await uploadMyDocument(fd)
      if (!r.ok) { toast.error(r.error ?? t("common.myDocs.uploadFailed")); return }
      toast.success(t("common.myDocs.uploaded"))
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.myDocs.uploadError"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-3 w-3" />
        {t("common.myDocs.upload")}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("common.myDocs.uploadTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("common.myDocs.name")}</label>
              <Input name="name" required maxLength={200} placeholder={t("common.myDocs.namePlaceholder")} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("common.myDocs.type")}</label>
              <select name="type" defaultValue="OTHER"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none">
                {DOC_TYPES.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("common.myDocs.file")}</label>
              <input ref={fileRef} name="file" type="file" required
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                className="w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white dark:file:bg-slate-100 dark:file:text-slate-900" />
              <p className="mt-1 text-[11px] text-slate-400">{t("common.myDocs.fileHint")}</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                {t("common.actions.cancel")}
              </Button>
              <Button type="submit" loading={busy} leftIcon={<Upload className="h-4 w-4" />}>
                {t("common.actions.upload")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Кнопка удаления своего документа. */
export function MyDocumentDelete({ documentId }: { documentId: string }) {
  const { t } = useT()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function del() {
    if (!(await askConfirm({ title: t("common.myDocs.deleteTitle"), confirmLabel: t("common.actions.delete"), danger: true }))) return
    setBusy(true)
    try {
      const r = await deleteMyDocument(documentId)
      if (!r.ok) { toast.error(r.error ?? t("common.myDocs.deleteFailed")); return }
      toast.success(t("common.myDocs.deleted"))
      router.refresh()
    } finally { setBusy(false) }
  }
  return (
    <button type="button" onClick={del} disabled={busy} title={t("common.actions.delete")}
      className="text-slate-400 hover:text-red-600 disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}
