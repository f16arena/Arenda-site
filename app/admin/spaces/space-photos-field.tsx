"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ImagePlus, Loader2, X, Camera } from "lucide-react"
import { toast } from "sonner"
import { saveSpacePhotos } from "@/app/actions/space-photos"

const MAX_PHOTOS = 8

/** Сжать картинку до ~1280px по большей стороне, JPEG q0.8 → data-URL. */
async function compressToDataUrl(file: File): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error("Не удалось прочитать файл"))
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error("Не удалось открыть изображение"))
    i.src = src
  })
  const max = 1280
  const ratio = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * ratio))
  const h = Math.max(1, Math.round(img.naturalHeight * ratio))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas недоступен")
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  let q = 0.8
  let out = canvas.toDataURL("image/jpeg", q)
  while (out.length > 580_000 && q > 0.4) {
    q = Math.round((q - 0.1) * 100) / 100
    out = canvas.toDataURL("image/jpeg", q)
  }
  return out
}

export function SpacePhotosField({
  spaceId,
  initialPhotos,
}: {
  spaceId: string
  initialPhotos: string[]
}) {
  const router = useRouter()
  const [photos, setPhotos] = useState<string[]>(initialPhotos)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  function persist(next: string[]) {
    setPhotos(next)
    startTransition(async () => {
      const r = await saveSpacePhotos(spaceId, next)
      if (!r.ok) { toast.error(r.error); return }
      router.refresh()
    })
  }

  async function onFiles(files: FileList) {
    if (photos.length >= MAX_PHOTOS) { toast.error(`Максимум ${MAX_PHOTOS} фото`); return }
    setBusy(true)
    try {
      const room = MAX_PHOTOS - photos.length
      const picked = Array.from(files).slice(0, room)
      const compressed: string[] = []
      for (const f of picked) {
        if (!f.type.startsWith("image/")) continue
        compressed.push(await compressToDataUrl(f))
      }
      if (compressed.length === 0) { toast.error("Выберите изображения"); return }
      persist([...photos, ...compressed])
      toast.success(`Добавлено фото: ${compressed.length}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось обработать фото")
    } finally {
      setBusy(false)
    }
  }

  function remove(idx: number) {
    persist(photos.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Camera className="h-3.5 w-3.5" />
        Фото помещения <span className="text-slate-300 dark:text-slate-600">для витрины и карточки</span>
      </label>
      <div className="grid grid-cols-4 gap-2">
        {photos.map((p, i) => (
          <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`Фото ${i + 1}`} className="h-full w-full cursor-zoom-in object-cover" onClick={() => setLightbox(p)} />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Удалить фото"
              className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-500 dark:border-slate-700 ${busy || pending ? "pointer-events-none opacity-60" : ""}`}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="text-[10px]">Добавить</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy || pending}
              onChange={(e) => { if (e.target.files?.length) void onFiles(e.target.files); e.target.value = "" }}
            />
          </label>
        )}
      </div>
      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
        До {MAX_PHOTOS} фото. Сжимаются автоматически. Первое — обложка на витрине.
      </p>

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Просмотр" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" />
          <button type="button" aria-label="Закрыть" className="absolute right-4 top-4 text-white/80 hover:text-white">
            <X className="h-7 w-7" />
          </button>
        </div>
      )}
    </div>
  )
}
