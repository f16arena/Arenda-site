"use client"

// Подложка: скан плана от архитектора, по которому обводят контуры.
//
// В техпаспорте несколько этажей часто лежат в одном PDF подряд, поэтому
// страница выбирается явно. Масштаб задаётся калибровкой: обвели на плане
// известный размер со штампа (например, стену 36,55 м) — подложка растянулась.

import { useRef, useState } from "react"
import { Image as ImageIcon, Loader2, Ruler, Trash2 } from "lucide-react"
import { countPdfPages, compressDataUrl, loadImageWithDimensions, renderPdfPage } from "@/lib/pdf-render"
import type { FloorLayoutV2 } from "@/lib/floor-layout"
import { useT } from "@/lib/i18n/client"
import type { FloorEditor } from "./use-floor-editor"

type Props = {
  editor: FloorEditor
  layout: FloorLayoutV2
}

export function UnderlayPanel({ editor, layout }: Props) {
  const { t } = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pages, setPages] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realLength, setRealLength] = useState("")

  const underlay = layout.underlay ?? null

  async function place(file: File, page: number) {
    setBusy(true)
    setError(null)
    try {
      const rendered =
        file.type === "application/pdf"
          ? await renderPdfPage(file, page)
          : await loadImageWithDimensions(file)
      // Подложку ужимаем: она едет в layoutJson и грузится вместе со страницей
      const url = await compressDataUrl(rendered.dataUrl, { maxDim: 2200, quality: 0.8 })
      editor.actions.setUnderlay({
        url,
        aspect: rendered.widthPx / rendered.heightPx,
        // до калибровки считаем, что подложка шириной с холст этажа
        widthMeters: layout.width,
        x: 0,
        y: 0,
        opacity: 0.55,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("adminObjects.map.underlay.uploadFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File) {
    setPendingFile(file)
    if (file.type === "application/pdf") {
      const count = await countPdfPages(file)
      setPages(count)
      if (count > 1) return // ждём выбора страницы
    } else {
      setPages(null)
    }
    await place(file, 1)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <input
        ref={fileRef}
        id="underlay-file"
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onFile(file)
          event.target.value = ""
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
        {underlay
          ? t("adminObjects.map.underlay.replace")
          : t("adminObjects.map.underlay.upload")}
      </button>

      {pages && pages > 1 && pendingFile ? (
        <span className="flex items-center gap-1 text-xs text-slate-500">
          Страница:
          {Array.from({ length: pages }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => void place(pendingFile, page)}
              className="h-6 w-6 rounded-md border border-slate-200 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {page}
            </button>
          ))}
        </span>
      ) : null}

      {underlay ? (
        <>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Прозрачность
            <input
              id="underlay-opacity"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={underlay.opacity ?? 0.55}
              onChange={(event) =>
                editor.actions.setUnderlay({ ...underlay, opacity: Number(event.target.value) })
              }
              className="w-24"
            />
          </label>

          <span className="text-xs text-slate-500">
            Ширина <b className="tabular-nums text-slate-900 dark:text-slate-100">{underlay.widthMeters.toFixed(1)} м</b>
          </span>

          <button
            type="button"
            onClick={() => {
              editor.clearMeasure()
              editor.setTool(editor.tool === "ruler" ? "select" : "ruler")
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              editor.tool === "ruler"
                ? "bg-orange-500 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400"
            }`}
          >
            <Ruler className="h-3.5 w-3.5" />
            {editor.tool === "ruler"
              ? t("adminObjects.map.underlay.measureHint")
              : t("adminObjects.map.underlay.calibrate")}
          </button>

          {editor.measured ? (
            <span className="flex items-center gap-1.5 rounded-lg bg-orange-50 px-2 py-1 text-xs dark:bg-orange-500/10">
              <span className="text-slate-600 dark:text-slate-300">
                Отрезок {editor.measured.toFixed(2)} м. Сколько на самом деле?
              </span>
              <input
                id="underlay-real-length"
                type="number"
                step="0.01"
                autoFocus
                value={realLength}
                onChange={(event) => setRealLength(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  const value = Number(event.currentTarget.value.replace(",", "."))
                  if (value > 0) {
                    editor.actions.calibrate(value)
                    setRealLength("")
                  }
                }}
                placeholder="36.55"
                className="h-6 w-20 rounded-md border border-orange-300 px-1.5 text-xs tabular-nums dark:bg-slate-800"
              />
              <span className="text-slate-500">м, Enter</span>
            </span>
          ) : null}

          <button
            type="button"
            title={t("adminObjects.map.underlay.drop")}
            onClick={() => editor.actions.setUnderlay(null)}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}

      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  )
}
