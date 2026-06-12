"use client"

import { useState } from "react"
import { X } from "lucide-react"
import type { FloorLayoutV2 } from "@/lib/floor-layout"
import {
  LAYOUT_TEMPLATES,
  buildLayoutFromTemplate,
  type LayoutTemplate,
  type TemplateCategory,
} from "@/lib/layout-templates"

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  floor: "Этажи",
  roof: "Крыша",
  territory: "Территория",
}

/** Мини-превью плана шаблона (SVG): комнаты + иконки. */
function TemplatePreview({ template }: { template: LayoutTemplate }) {
  const els = template.build(template.width, template.height)
  return (
    <svg
      viewBox={`0 0 ${template.width} ${template.height}`}
      className="h-28 w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
      preserveAspectRatio="xMidYMid meet"
    >
      {els.map((el) => {
        if (el.type === "rect") {
          const common = (el.kind ?? "rentable") === "common"
          return (
            <rect
              key={el.id}
              x={el.x} y={el.y} width={el.width} height={el.height}
              fill={common ? "#e2e8f0" : "#bfdbfe"}
              stroke={common ? "#94a3b8" : "#60a5fa"}
              strokeWidth={0.15}
            />
          )
        }
        if (el.type === "icon") {
          return <circle key={el.id} cx={el.x} cy={el.y} r={Math.max(0.6, el.size / 2.4)} fill="#a78bfa" />
        }
        return null
      })}
    </svg>
  )
}

export function TemplateGallery({
  initialCategory,
  hasExisting,
  onApply,
  onClose,
}: {
  initialCategory: TemplateCategory
  hasExisting: boolean
  onApply: (layout: FloorLayoutV2) => void
  onClose: () => void
}) {
  const [category, setCategory] = useState<TemplateCategory>(initialCategory)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const items = LAYOUT_TEMPLATES.filter((t) => t.category === category)

  const apply = (t: LayoutTemplate) => {
    onApply(buildLayoutFromTemplate(t))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Начните с шаблона</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Готовый план масштабируется под зону — потом правьте вручную.</p>
          </div>
          <button onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-6 py-2 dark:border-slate-800">
          {(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                category === c
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-6 sm:grid-cols-2">
          {items.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <TemplatePreview template={t} />
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{t.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
              {hasExisting && confirmId === t.id ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => apply(t)}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Заменить план
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => (hasExisting ? setConfirmId(t.id) : apply(t))}
                  className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  {hasExisting ? "Выбрать (заменит план)" : "Выбрать"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
