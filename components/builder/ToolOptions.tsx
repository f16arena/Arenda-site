"use client"

// ADR: Контекстные опции активного инструмента (под тулбаром): палитра материалов для
// «ведра», форма лестницы, подсказки для стены/проёмов. Управляет editorStore.

import { useEditorStore, type StairShape, type TerrainMode } from "@/store/builder-store"
import { MATERIALS, TOKENS } from "@/lib/builder/materials"
import { presetsFor } from "@/lib/builder/openings"

const PAINT_IDS = [
  // стены/фасад
  "paint_white", "paint_gray", "paint_blue", "paint_green", "paint_terra", "brick", "concrete", "stone", "wood_panel", "loft", "wallpaper", "clinker", "facade_panel", "composite", "curtain_glass",
  // полы
  "laminate", "parquet", "oak_floor", "wenge_floor", "tile", "marble", "granite", "carpet_gray", "carpet_blue", "vinyl", "checker", "terrazzo",
  // кровля
  "metal_roof", "roof_red", "roof_brown", "roof_green", "roof_membrane",
]
const STAIRS: { id: StairShape; label: string }[] = [
  { id: "straight", label: "Прямая" },
  { id: "l", label: "Г-образная" },
  { id: "u", label: "П-образная" },
]
const TERRAIN: { id: TerrainMode; label: string }[] = [
  { id: "raise", label: "Поднять" },
  { id: "lower", label: "Опустить" },
  { id: "flatten", label: "Выровнять" },
  { id: "smooth", label: "Сгладить" },
]

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute left-1/2 top-[7rem] z-20 flex max-w-[90vw] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-xl px-2.5 py-1.5 text-xs shadow-xl backdrop-blur-xl"
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
  const terrainMode = useEditorStore((s) => s.terrainMode)
  const setTerrainMode = useEditorStore((s) => s.setTerrainMode)
  const armedAsset = useEditorStore((s) => s.armedAsset)
  const openingVariant = useEditorStore((s) => s.openingVariant)
  const setOpeningVariant = useEditorStore((s) => s.setOpeningVariant)

  if (tool === "terrain") {
    return (
      <Shell>
        <span className="shrink-0">Рельеф:</span>
        {TERRAIN.map((t) => {
          const active = terrainMode === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTerrainMode(t.id)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {t.label}
            </button>
          )
        })}
        <span className="shrink-0">— зажми и води по газону</span>
      </Shell>
    )
  }
  if (tool === "object") {
    return <Shell><span>{armedAsset ? "Призрак у курсора · R — поворот · клик — поставить · Esc — отмена" : "Выберите ассет в каталоге снизу"}</span></Shell>
  }

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
    return <Shell><span>Клик — начало, клик — конец (цепочкой). Длину — цифрами + Enter. Shift — орто (90°). Esc — стоп.</span></Shell>
  }
  if (tool === "room") {
    return <Shell><span>Зажми и растяни прямоугольник на этаже → 4 стены и пол создаются сразу.</span></Shell>
  }
  if (tool === "door" || tool === "window") {
    const presets = presetsFor(tool)
    return (
      <Shell>
        <span className="shrink-0">{tool === "door" ? "Дверь:" : "Окно:"}</span>
        {presets.map((p) => {
          const active = openingVariant === p.variant
          return (
            <button
              key={p.variant}
              type="button"
              onClick={() => setOpeningVariant(p.variant)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {p.label}
            </button>
          )
        })}
        <span className="shrink-0">— клик на стене</span>
      </Shell>
    )
  }
  if (tool === "select") {
    return <Shell><span>Клик — выбрать (справа свойства). Тяни узел/стену/объект. Высоту/толщину/тип стены — в панели. Delete — удалить.</span></Shell>
  }
  return null
}
