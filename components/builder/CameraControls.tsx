"use client"

// ADR: Плавающие пресеты камеры (§6.5): 3D-орбита / сверху / план (орто) / walk.
// Хоткеи 1/2/3/4 дублируются в BuilderApp. Плавная интерполяция камеры — Фаза 3.

import { Box, Eye, Map, Footprints, Maximize } from "lucide-react"
import { useEditorStore, type CameraMode } from "@/store/builder-store"
import { TOKENS } from "@/lib/builder/materials"

const MODES: { id: CameraMode; label: string; key: string; Icon: typeof Box }[] = [
  { id: "orbit", label: "3D", key: "1", Icon: Box },
  { id: "top", label: "Сверху", key: "2", Icon: Eye },
  { id: "plan", label: "План", key: "3", Icon: Map },
  { id: "walk", label: "Walk", key: "4", Icon: Footprints },
]

export function CameraControls({ onFit }: { onFit?: () => void }) {
  const cameraMode = useEditorStore((s) => s.cameraMode)
  const setCameraMode = useEditorStore((s) => s.setCameraMode)
  return (
    <div
      className="absolute bottom-9 right-3 z-20 flex items-center gap-1 rounded-2xl p-1.5 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      {onFit && (
        <button
          type="button"
          onClick={onFit}
          title="Вписать сцену в кадр"
          className="flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px] font-medium"
          style={{ background: "transparent", color: TOKENS.text }}
        >
          <Maximize className="h-4 w-4" />
          Вписать
        </button>
      )}
      {MODES.map((m) => {
        const active = cameraMode === m.id
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setCameraMode(m.id)}
            title={`${m.label} (${m.key})`}
            className="flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px] font-medium transition-all"
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
