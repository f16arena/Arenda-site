"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload, Loader2, Trash2, X } from "lucide-react"
import { uploadMyDocument, deleteMyDocument } from "@/app/actions/cabinet-docs"

const DOC_TYPES: { value: string; label: string }[] = [
  { value: "OTHER", label: "Прочее" },
  { value: "ID", label: "Удостоверение / ИИН" },
  { value: "REGISTRATION", label: "Свидетельство ИП / устав" },
  { value: "POWER_OF_ATTORNEY", label: "Доверенность" },
  { value: "CONTRACT", label: "Договор / приложение" },
]

/** Кнопка «Загрузить» + форма загрузки документа арендатором в свой кабинет. */
export function MyDocumentUpload() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const file = fd.get("file")
    if (!(file instanceof File) || file.size === 0) { toast.error("Прикрепите файл"); return }
    setBusy(true)
    try {
      const r = await uploadMyDocument(fd)
      if (!r.ok) { toast.error(r.error ?? "Не удалось загрузить"); return }
      toast.success("Документ загружен")
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка загрузки")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <Upload className="h-3 w-3" />
        Загрузить
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Загрузить документ</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Название *</label>
              <input name="name" required maxLength={200} placeholder="например, Свидетельство ИП"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Тип</label>
              <select name="type" defaultValue="OTHER"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none">
                {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Файл *</label>
              <input ref={fileRef} name="file" type="file" required
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                className="w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white dark:file:bg-slate-100 dark:file:text-slate-900" />
              <p className="mt-1 text-[11px] text-slate-400">PDF, изображения, Word/Excel. До 10 МБ.</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} disabled={busy}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">Отмена</button>
              <button type="submit" disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Загрузить
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

/** Кнопка удаления своего документа. */
export function MyDocumentDelete({ documentId }: { documentId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function del() {
    if (!confirm("Удалить этот документ?")) return
    setBusy(true)
    try {
      const r = await deleteMyDocument(documentId)
      if (!r.ok) { toast.error(r.error ?? "Не удалось удалить"); return }
      toast.success("Документ удалён")
      router.refresh()
    } finally { setBusy(false) }
  }
  return (
    <button type="button" onClick={del} disabled={busy} title="Удалить"
      className="text-slate-400 hover:text-red-600 disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}
