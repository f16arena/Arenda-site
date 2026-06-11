"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ImagePlus, Loader2, Palette, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { updateOrgLogo } from "@/app/actions/branding"

/**
 * Брендирование: загрузка логотипа организации для сайдбара.
 * Картинка ужимается на клиенте до 256px и сохраняется data-URL'ом.
 * Без логотипа в сайдбаре показывается логотип Commrent.
 */
export function BrandingSection({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [preview, setPreview] = useState<string | null>(currentLogoUrl)

  async function resizeToDataUrl(file: File): Promise<string> {
    const sourceUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
      reader.readAsDataURL(file)
    })
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error("Не удалось открыть картинку"))
      i.src = sourceUrl
    })
    const max = 256
    const ratio = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * ratio))
    const h = Math.max(1, Math.round(img.naturalHeight * ratio))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas недоступен")
    ctx.drawImage(img, 0, 0, w, h)
    // PNG — сохраняет прозрачность логотипов
    return canvas.toDataURL("image/png")
  }

  function onFile(file: File) {
    startTransition(async () => {
      try {
        const dataUrl = await resizeToDataUrl(file)
        const r = await updateOrgLogo(dataUrl)
        if (!r.ok) { toast.error(r.error); return }
        setPreview(dataUrl)
        toast.success("Логотип сохранён — он появится в сайдбаре")
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось загрузить логотип")
      }
    })
  }

  function onRemove() {
    startTransition(async () => {
      const r = await updateOrgLogo(null)
      if (!r.ok) { toast.error(r.error); return }
      setPreview(null)
      toast.success("Логотип убран — в сайдбаре будет логотип Commrent")
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <Palette className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Брендирование</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Логотип организации" className="h-full w-full object-contain p-1" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/commrent-mark.png" alt="Commrent" className="h-full w-full object-contain p-1 opacity-60" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ваш логотип показывается в шапке меню вместо логотипа Commrent.
            PNG / JPG / WebP, лучше квадратный — система ужмёт до 256px.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 ${pending ? "pointer-events-none opacity-60" : ""}`}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {preview ? "Заменить логотип" : "Загрузить логотип"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={pending}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onFile(file)
                  e.target.value = ""
                }}
              />
            </label>
            {preview && (
              <button
                type="button"
                onClick={onRemove}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Убрать (вернуть Commrent)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
