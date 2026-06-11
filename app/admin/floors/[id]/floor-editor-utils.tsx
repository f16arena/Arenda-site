"use client"

// Утилиты редактора плана этажа, вынесенные из floor-editor.tsx
// (performance-gate держит редактор < 75 КБ).

import { useState, useEffect } from "react"
import { Image as ImageIcon, X as XIcon } from "lucide-react"
import type { FloorLayoutV2, FloorElement, Point } from "@/lib/floor-layout"

export const SNAP_M = 0.25 // привязка к 25 см

export function snap(v: number, step = SNAP_M): number {
  return Math.round(v / step) * step
}

const SNAP_VERTEX_M = 0.4 // допуск магнита к точкам стен/полигонов (40 см)

/**
 * Найти ближайшую вершину существующей стены / полигона / прямоугольника
 * к точке pt. Если в пределах SNAP_VERTEX_M — возвращает её координаты.
 * excludeId исключает указанный элемент (например, тот, что сейчас рисуем).
 */
export function findNearestVertex(
  layout: FloorLayoutV2,
  pt: Point,
  excludeId?: string,
): Point | null {
  let best: Point | null = null
  let bestDist = SNAP_VERTEX_M
  for (const el of layout.elements) {
    if (el.id === excludeId) continue
    const candidates: Point[] = []
    if (el.type === "wall") {
      candidates.push({ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 })
    } else if (el.type === "polygon") {
      candidates.push(...el.points)
    } else if (el.type === "rect") {
      candidates.push(
        { x: el.x, y: el.y },
        { x: el.x + el.width, y: el.y },
        { x: el.x + el.width, y: el.y + el.height },
        { x: el.x, y: el.y + el.height },
      )
    }
    for (const v of candidates) {
      const d = Math.hypot(v.x - pt.x, v.y - pt.y)
      if (d < bestDist) {
        bestDist = d
        best = { x: v.x, y: v.y }
      }
    }
  }
  return best
}

/** Дебаунс значения: 3D-сцена пересобирается не на каждый пиксель drag-а, а раз в N мс */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** Пропорциональное масштабирование элемента плана (калибровка размеров) */
export function scaleElement(el: FloorElement, k: number): FloorElement {
  if (el.type === "rect") return { ...el, x: el.x * k, y: el.y * k, width: el.width * k, height: el.height * k }
  if (el.type === "polygon") return { ...el, points: el.points.map((p) => ({ x: p.x * k, y: p.y * k })) }
  if (el.type === "door") return { ...el, x: el.x * k, y: el.y * k, width: el.width * k }
  if (el.type === "window") return { ...el, x: el.x * k, y: el.y * k, width: el.width * k }
  if (el.type === "label") return { ...el, x: el.x * k, y: el.y * k, fontSize: (el.fontSize ?? 0.5) * k }
  if (el.type === "wall") return { ...el, x1: el.x1 * k, y1: el.y1 * k, x2: el.x2 * k, y2: el.y2 * k, thickness: (el.thickness ?? 0.15) * k }
  if (el.type === "icon") return { ...el, x: el.x * k, y: el.y * k, size: el.size * k }
  return el
}

/** Поворот картинки-подложки на 90° по часовой (canvas → dataURL), синхронно с rotateLayout90. */
export function rotateImage90(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalHeight
      canvas.height = img.naturalWidth
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("canvas 2d недоступен")); return }
      ctx.translate(img.naturalHeight, 0)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(img, 0, 0)
      const isPng = src.startsWith("data:image/png")
      resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.92))
    }
    img.onerror = () => reject(new Error("картинка не загрузилась"))
    img.crossOrigin = "anonymous"
    img.src = src
  })
}

/** Панель «Подложка (фото плана)»: превью, прозрачность, загрузка PDF/картинки/URL */
export function UnderlayPanel({
  underlayUrl, opacity, setOpacity, loading, onUpload, onSetUrl, onRemove,
}: {
  underlayUrl: string | null
  opacity: number
  setOpacity: (v: number) => void
  loading: boolean
  onUpload: (file: File) => void
  onSetUrl: (url: string) => void
  onRemove: () => void
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5" />
        Подложка (фото плана)
      </p>
      {underlayUrl ? (
        <>
          <div className="relative aspect-video rounded border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={underlayUrl} alt="План" className="w-full h-full object-contain" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Прозрачность: {Math.round(opacity * 100)}%</label>
            <input
              type="range"
              min="0"
              max="100"
              value={opacity * 100}
              onChange={(e) => setOpacity(parseInt(e.target.value) / 100)}
              className="w-full"
            />
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 text-xs text-red-500 hover:underline"
          >
            <XIcon className="h-3 w-3" /> Удалить подложку
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <label className={`block text-xs cursor-pointer ${loading ? "pointer-events-none opacity-60" : ""}`}>
            <span className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm font-medium transition-colors">
              {loading ? (
                <>
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Загрузка...
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4" />
                  Загрузить план (PDF / картинка)
                </>
              )}
            </span>
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onUpload(file)
                e.target.value = ""
              }}
            />
          </label>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Загрузите PDF или PNG/JPG плана этажа. Система спросит реальную ширину
            плана и автоматически подгонит холст так, чтобы <b>1 клетка = 1 метр</b>.
          </p>
          <details className="group">
            <summary className="text-[10px] text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
              ▸ Или вставить URL картинки
            </summary>
            <input
              type="url"
              placeholder="https://..."
              onChange={(e) => {
                const url = e.target.value.trim()
                if (url) onSetUrl(url)
              }}
              className="w-full mt-1.5 rounded border border-slate-200 dark:border-slate-800 px-2 py-1 text-xs"
            />
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
              Прямая ссылка на изображение (Google Drive / Dropbox / любой CDN). Аспект холста придётся настроить вручную.
            </p>
          </details>
        </div>
      )}
    </div>
  )
}

/** Скелет правых панелей редактора, пока dynamic-чанки грузятся */
export function PanelSkeleton({ tone = "default" }: { tone?: "default" | "danger" }) {
  return (
    <div className={`rounded-xl border p-4 ${
      tone === "danger"
        ? "border-red-200 bg-red-50/40 dark:border-red-500/30 dark:bg-red-500/5"
        : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    }`}>
      <div className="h-4 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mt-3 space-y-2">
        <div className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  )
}
