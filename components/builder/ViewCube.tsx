"use client"

// ADR: ViewCube — быстрые ракурсы орбитальной камеры (§20). Вызывает engine.orbitTo
// через колбэк из BuilderApp. Компактная сетка сторон + изометрия.

import { TOKENS } from "@/lib/builder/materials"

const B = Math.PI / 3 // обычный наклон
const VIEWS: { l: string; a: number; b: number }[] = [
  { l: "Сверху", a: -Math.PI / 2, b: 0.02 },
  { l: "Спереди", a: -Math.PI / 2, b: B },
  { l: "Сзади", a: Math.PI / 2, b: B },
  { l: "Слева", a: 0, b: B },
  { l: "Справа", a: Math.PI, b: B },
  { l: "Изо", a: -Math.PI / 4, b: Math.PI / 3.2 },
]

export function ViewCube({ onView }: { onView: (alpha: number, beta: number) => void }) {
  return (
    <div
      className="absolute right-3 bottom-24 z-20 grid w-28 grid-cols-2 gap-1 rounded-xl p-1.5 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      {VIEWS.map((v) => (
        <button
          key={v.l}
          type="button"
          onClick={() => onView(v.a, v.b)}
          className="rounded-lg py-1 text-[10px] font-medium transition-all"
          style={{ background: "rgba(148,163,184,0.12)", color: TOKENS.text }}
        >
          {v.l}
        </button>
      ))}
    </div>
  )
}
