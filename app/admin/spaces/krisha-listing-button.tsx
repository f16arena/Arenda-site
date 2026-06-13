"use client"

import { useState, useTransition } from "react"
import { Megaphone, Copy, ExternalLink, X, Download, Check } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { generateListingDraft, setListingStatus, type GeneratedListing } from "@/app/actions/krisha-listing"

function money(v: number | null): string {
  return v && v > 0 ? `${Math.round(v).toLocaleString("ru-RU")} ₸` : "—"
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} скопировано`)
  } catch {
    toast.error("Не удалось скопировать")
  }
}

function downloadDataUrl(dataUrl: string, name: string) {
  const a = document.createElement("a")
  a.href = dataUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function KrishaListingButton({ spaceId }: { spaceId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [data, setData] = useState<GeneratedListing | null>(null)
  const [publishedUrl, setPublishedUrl] = useState("")
  const [marked, setMarked] = useState(false)

  function prepare() {
    startTransition(async () => {
      const res = await generateListingDraft(spaceId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setData(res)
      setPublishedUrl("")
      setMarked(false)
      setOpen(true)
    })
  }

  function openKrisha() {
    if (!data) return
    window.open(data.krishaUrl, "_blank", "noopener,noreferrer")
    void setListingStatus(data.draftId, "COPIED")
  }

  function markPublished() {
    if (!data) return
    startTransition(async () => {
      const res = await setListingStatus(data.draftId, "PUBLISHED", publishedUrl || undefined)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setMarked(true)
      toast.success("Отмечено как опубликованное")
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={prepare}
        disabled={pending}
        title="Подготовить объявление для Krisha"
        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50 dark:text-emerald-400"
      >
        <Megaphone className="h-3.5 w-3.5" />
        {pending && !open ? "…" : "Krisha"}
      </button>

      {open && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <h2 className="text-base font-semibold">Объявление для Krisha</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-4 text-sm">
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Полуавтомат: текст и фото готовы. Откройте Krisha, войдите в аккаунт и опубликуйте — вставьте текст и
                загрузите фото (krisha требует вход, SMS и модерацию, прямого API публикации у них нет).
              </p>

              {/* Заголовок */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Заголовок</span>
                  <button type="button" onClick={() => copy(data.title, "Заголовок")} className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                    <Copy className="h-3 w-3" /> Копировать
                  </button>
                </div>
                <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">{data.title}</div>
              </div>

              {/* Цена */}
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="text-slate-500">Цена/мес: </span>
                  <span className="font-medium">{money(data.priceMonthly)}</span>
                </div>
                <div>
                  <span className="text-slate-500">₸/м²: </span>
                  <span className="font-medium">{money(data.pricePerSqm)}</span>
                </div>
                {data.marketPerSqm ? (
                  <div>
                    <span className="text-slate-500">Рынок ₸/м²: </span>
                    <span className="font-medium">~{Math.round(data.marketPerSqm).toLocaleString("ru-RU")}</span>
                  </div>
                ) : null}
              </div>

              {/* Описание */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Описание</span>
                  <button type="button" onClick={() => copy(data.description, "Описание")} className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                    <Copy className="h-3 w-3" /> Копировать
                  </button>
                </div>
                <textarea
                  readOnly
                  value={data.description}
                  rows={9}
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              {/* Фото */}
              {data.photos.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Фото ({data.photos.length})</span>
                    <button
                      type="button"
                      onClick={() => data.photos.forEach((p, i) => downloadDataUrl(p, `krisha-${spaceId}-${i + 1}.jpg`))}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400"
                    >
                      <Download className="h-3 w-3" /> Скачать все
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.photos.map((p, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={p}
                        alt={`фото ${i + 1}`}
                        title="Скачать"
                        onClick={() => downloadDataUrl(p, `krisha-${spaceId}-${i + 1}.jpg`)}
                        className="h-16 w-16 cursor-pointer rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Действия */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <Button onClick={openKrisha} leftIcon={<ExternalLink className="h-4 w-4" />}>
                  Открыть Krisha
                </Button>
                <Button variant="secondary" onClick={() => copy(`${data.title}\n\n${data.description}`, "Объявление")} leftIcon={<Copy className="h-4 w-4" />}>
                  Копировать всё
                </Button>
              </div>

              {/* Отметить опубликованным */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="url"
                  value={publishedUrl}
                  onChange={(e) => setPublishedUrl(e.target.value)}
                  placeholder="Ссылка на объявление (необяз.)"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={markPublished}
                  disabled={pending || marked}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                >
                  {marked ? <Check className="h-3.5 w-3.5" /> : null}
                  {marked ? "Отмечено" : "Опубликовано"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
