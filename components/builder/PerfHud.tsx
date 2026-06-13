"use client"

// ADR: Перф-HUD (§24): живой FPS + переключатель «Турбо» (рендер в пониженном
// разрешении + лёгкие тени). Опрос FPS по интервалу (не на каждый кадр), чтобы сам
// HUD не нагружал сцену. Цвет индикатора: зелёный ≥50, жёлтый ≥30, иначе красный.

import { useEffect, useRef, useState } from "react"
import { Gauge, Zap } from "lucide-react"
import { useEditorStore } from "@/store/builder-store"
import { TOKENS } from "@/lib/builder/materials"

export function PerfHud({ getFps }: { getFps: () => number }) {
  const [fps, setFps] = useState(60)
  const turbo = useEditorStore((s) => s.turbo)
  const setTurbo = useEditorStore((s) => s.setTurbo)
  const ref = useRef(getFps)
  useEffect(() => {
    ref.current = getFps
  })

  useEffect(() => {
    const id = window.setInterval(() => setFps(Math.round(ref.current())), 500)
    return () => window.clearInterval(id)
  }, [])

  const color = fps >= 50 ? "#34d399" : fps >= 30 ? "#fbbf24" : "#f87171"

  return (
    <div
      className="absolute right-3 top-16 z-30 flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.text }}
    >
      <Gauge className="h-3.5 w-3.5" style={{ color }} />
      <span style={{ color }}>{fps} FPS</span>
      <span className="mx-0.5 h-4 w-px" style={{ background: TOKENS.panelBorder }} />
      <button
        type="button"
        onClick={() => setTurbo(!turbo)}
        title="Турбо: рендер в пониженном разрешении для высокого FPS"
        className="flex items-center gap-1 rounded-md px-2 py-0.5"
        style={{ background: turbo ? TOKENS.accent : "rgba(148,163,184,0.12)", color: turbo ? "#0b1220" : TOKENS.muted }}
      >
        <Zap className="h-3 w-3" />
        Турбо
      </button>
    </div>
  )
}
