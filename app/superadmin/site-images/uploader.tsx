"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload, Loader2, Trash2 } from "lucide-react"
import { uploadSiteImage, removeSiteImage } from "@/app/actions/site-images"

export function SiteImageUploader({
  slot,
  label,
  hint,
  version,
}: {
  slot: string
  label: string
  hint: string
  version: number | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const has = version != null

  function onFile(file?: File) {
    if (!file) return
    const fd = new FormData()
    fd.append("file", file)
    startTransition(async () => {
      const r = await uploadSiteImage(slot, fd)
      if (r.ok) { toast.success("Изображение обновлено"); router.refresh() }
      else toast.error(r.error ?? "Ошибка")
    })
  }
  function remove() {
    startTransition(async () => { await removeSiteImage(slot); toast.success("Удалено"); router.refresh() })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint} · slot: <code>{slot}</code></p>

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
        {has ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/site-image/${slot}?v=${version}`} alt={label} className="max-h-64 w-full object-contain" />
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Изображение не загружено</div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="hidden" disabled={pending} onChange={(e) => onFile(e.target.files?.[0])} />
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {has ? "Заменить" : "Загрузить"}
        </label>
        {has && (
          <button type="button" onClick={remove} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" /> Удалить
          </button>
        )}
      </div>
    </div>
  )
}
