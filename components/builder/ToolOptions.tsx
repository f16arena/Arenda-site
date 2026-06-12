"use client"

// ADR: Контекстные опции активного инструмента (под тулбаром): палитра материалов для
// «ведра», форма лестницы, подсказки для стены/проёмов. Управляет editorStore.

import { useEditorStore, type StairShape } from "@/store/builder-store"
import { MATERIALS, TOKENS } from "@/lib/builder/materials"

const PAINT_IDS = ["brick", "plaster_white", "concrete", "block", "laminate", "tile", "paving", "metal_roof"]
const STAIRS: { id: StairShape; label: string }[] = [
  { id: "straight", label: "Прямая" },
  { id: "l", label: "Г-образная" },
  { id: "u", label: "П-образная" },
]

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute left-1/2 top-[4.5rem] z-20 flex max-w-[90vw] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-xl px-2.5 py-1.5 text-xs shadow-xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.muted }}
    >
      {children}
    </div>
  )
}

export function ToolOptions() {
  const tool = useEditorStore((s) => s.activeTool)
  const paintMaterialId = useEditorStore((s) => s.paintMaterialId)
  const setPaintMaterial = useEditorStore((s) => s.setPaintMaterial)
  const stairShape = useEditorStore((s) => s.stairShape)
  const setStairShape = useEditorStore((s) => s.setStairShape)

  if (tool === "material") {
    return (
      <Shell>
        <span className="shrink-0">Материал:</span>
        {PAINT_IDS.map((id) => {
          const m = MATERIALS[id]
          const active = paintMaterialId === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPaintMaterial(id)}
              title={m.name}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1"
              style={{ background: active ? "rgba(56,189,248,0.18)" : "transparent", border: `1px solid ${active ? TOKENS.accent : "transparent"}` }}
            >
              <span className="h-4 w-4 rounded" style={{ background: m.color, border: "1px solid rgba(0,0,0,0.2)" }} />
              <span style={{ color: active ? TOKENS.text : TOKENS.muted }}>{m.name}</span>
            </button>
          )
        })}
      </Shell>
    )
  }
  if (tool === "stair") {
    return (
      <Shell>
        <span className="shrink-0">Лестница:</span>
        {STAIRS.map((s) => {
          const active = stairShape === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStairShape(s.id)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {s.label}
            </button>
          )
        })}
        <span className="shrink-0">— клик на этаже ставит лестницу к верхнему</span>
      </Shell>
    )
  }
  if (tool === "wall") {
    return <Shell><span>Клик — начало, клик — конец (цепочкой). Введите длину цифрами + Enter. Esc — завершить.</span></Shell>
  }
  if (tool === "door" || tool === "window") {
    return <Shell><span>Кликните на стену — {tool === "door" ? "дверь" : "окно"} вырежется в стене со снапом.</span></Shell>
  }
  if (tool === "select") {
    return <Shell><span>Клик — выбрать. Тяните синие узлы — стены следуют. Delete — удалить.</span></Shell>
  }
  return null
}
