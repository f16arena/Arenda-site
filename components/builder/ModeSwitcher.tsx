"use client"

// ADR: Верхний переключатель режимов (§20). Меняет mode в editorStore (он же ставит
// инструмент по умолчанию). Каталог и тулбар подстраиваются под режим.

import { Hammer, Sofa, PaintBucket, Mountain, Waves, Trees } from "lucide-react"
import { useEditorStore, type BuildMode } from "@/store/builder-store"
import { TOKENS } from "@/lib/builder/materials"

const MODES: { id: BuildMode; label: string; Icon: typeof Hammer }[] = [
  { id: "build", label: "Строить", Icon: Hammer },
  { id: "buy", label: "Купить", Icon: Sofa },
  { id: "material", label: "Материал", Icon: PaintBucket },
  { id: "terrain", label: "Рельеф", Icon: Mountain },
  { id: "water", label: "Вода", Icon: Waves },
  { id: "landscape", label: "Ландшафт", Icon: Trees },
]

export function ModeSwitcher() {
  const mode = useEditorStore((s) => s.mode)
  const setMode = useEditorStore((s) => s.setMode)
  return (
    <div
      className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl px-1.5 py-1 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      {MODES.map((m) => {
        const active = mode === m.id
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
            style={{ background: active ? TOKENS.accent : "transparent", color: active ? "#0b1220" : TOKENS.text }}
          >
            <m.Icon className="h-4 w-4" />
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
