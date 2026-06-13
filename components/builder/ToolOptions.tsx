"use client"

// ADR: Контекстные опции активного инструмента (под тулбаром): палитра материалов для
// «ведра», форма лестницы, подсказки для стены/проёмов. Управляет editorStore.

import { useEditorStore, type StairShape, type TerrainMode, type FenceStyle } from "@/store/builder-store"
import { MATERIALS, TOKENS } from "@/lib/builder/materials"
import { presetsFor } from "@/lib/builder/openings"

const PAINT_IDS = [
  // стены/фасад
  "paint_white", "paint_gray", "paint_blue", "paint_green", "paint_terra", "paint_beige", "paint_yellow", "paint_rose", "paint_mint", "paint_graphite", "paint_lavender", "paint_black", "paint_olive", "paint_navy",
  "wallpaper", "wallpaper_floral", "wallpaper_stripe", "wallpaper_gray", "wallpaper_blue", "wallpaper_dark", "venetian", "decor_plaster", "microcement",
  "brick", "brick_white", "brick_red", "brick_gray", "brick_loft_dark", "concrete", "concrete_raw", "stone", "stone_slate", "wood_panel", "wood_panel_light", "wood_panel_dark", "panel_3d", "tile_subway", "tile_subway_green", "green_wall", "loft", "mirror_wall", "felt_panel", "gypsum_board", "marble_wall", "cork_wall",
  // потолки
  "ceil_white", "ceil_stretch_gloss", "ceil_stretch_matte", "ceil_stretch_black", "ceil_armstrong", "ceil_slats_white", "ceil_slats_wood", "ceil_slats_black", "ceil_concrete", "ceil_acoustic", "ceil_loft_black", "ceil_coffered", "ceil_beam_wood",
  // фасады
  "clinker", "clinker_gray", "clinker_brown", "brick_facade", "brick_facade_white", "stone_facade", "travertine", "plaster_beige", "plaster_gray", "plaster_terra", "plaster_graphite", "plaster_yellow", "composite", "composite_dark", "composite_wood", "composite_white", "facade_metal", "facade_metal_dark", "facade_panel", "facade_panel_white", "facade_panel_beige", "facade_panel_graphite", "facade_panel_terra", "facade_granite_vent", "facade_wood", "facade_wood_dark", "curtain_glass",
  // полы
  "laminate", "laminate_light", "laminate_dark", "laminate_gray", "parquet", "parquet_herringbone", "parquet_deck", "oak_floor", "wenge_floor", "ash_floor", "walnut_floor", "tile", "tile_white", "tile_gray", "tile_beige", "tile_black", "granite", "granite_dark", "granite_beige", "marble", "marble_white", "marble_black", "marble_emperador", "concrete_polished", "carpet_gray", "carpet_blue", "carpet_beige", "carpet_green", "carpet_red", "carpet_dark", "vinyl", "vinyl_wood", "vinyl_stone", "cork", "epoxy", "epoxy_gray", "epoxy_blue", "checker", "checker_bw", "terrazzo", "terrazzo_dark", "painted_board", "rubber_floor",
  // кровля
  "metal_roof", "metal_roof_graphite", "metal_roof_red", "metal_roof_brown", "metal_roof_green", "metal_roof_blue", "profile_sheet", "profile_sheet_red", "soft_roof", "soft_roof_brown", "soft_roof_green", "ceramic_roof_red", "ceramic_roof_brown", "seam_roof", "seam_roof_dark", "copper_roof", "slate_roof", "roof_red", "roof_brown", "roof_green", "roof_membrane",
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
  { id: "terrace", label: "Террасы" },
]
const WATER_DEPTHS: { mm: number; label: string }[] = [
  { mm: 400, label: "Мелко 0.4 м" },
  { mm: 800, label: "Средне 0.8 м" },
  { mm: 1500, label: "Глубоко 1.5 м" },
]
const PATH_WIDTHS: { mm: number; label: string }[] = [
  { mm: 1200, label: "1.2 м" },
  { mm: 3000, label: "3 м" },
  { mm: 6000, label: "6 м" },
]
const PAVE_MATERIALS: { id: string; label: string }[] = [
  { id: "asphalt", label: "Асфальт" },
  { id: "paving", label: "Брусчатка" },
  { id: "concrete", label: "Бетон" },
  { id: "tile", label: "Плитка" },
  { id: "granite", label: "Гранит" },
  { id: "grass", label: "Газон" },
]
const FENCE_STYLES: { id: FenceStyle; label: string }[] = [
  { id: "profnastil", label: "Профнастил" },
  { id: "shtaketnik", label: "Евроштакетник" },
  { id: "mesh", label: "3D-сетка" },
  { id: "forged", label: "Ковка" },
  { id: "wood", label: "Дерево" },
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
  const waterDepth = useEditorStore((s) => s.waterDepth)
  const setWaterDepth = useEditorStore((s) => s.setWaterDepth)
  const pathKind = useEditorStore((s) => s.pathKind)
  const setPathKind = useEditorStore((s) => s.setPathKind)
  const pathWidth = useEditorStore((s) => s.pathWidth)
  const setPathWidth = useEditorStore((s) => s.setPathWidth)
  const fenceStyle = useEditorStore((s) => s.fenceStyle)
  const setFenceStyle = useEditorStore((s) => s.setFenceStyle)
  const paveMaterial = useEditorStore((s) => s.paveMaterial)
  const setPaveMaterial = useEditorStore((s) => s.setPaveMaterial)
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
  if (tool === "water") {
    return (
      <Shell>
        <span className="shrink-0">Водоём — глубина:</span>
        {WATER_DEPTHS.map((d) => {
          const active = waterDepth === d.mm
          return (
            <button
              key={d.mm}
              type="button"
              onClick={() => setWaterDepth(d.mm)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {d.label}
            </button>
          )
        })}
        <span className="shrink-0">— клик ставит точки контура, клик у старта или Enter — залить, Esc — отмена</span>
      </Shell>
    )
  }
  if (tool === "road") {
    return (
      <Shell>
        <span className="shrink-0">Тип:</span>
        {([{ id: "road", label: "Дорога" }, { id: "path", label: "Дорожка" }] as const).map((k) => {
          const active = pathKind === k.id
          return (
            <button key={k.id} type="button" onClick={() => setPathKind(k.id)} className="shrink-0 rounded-lg px-2.5 py-1 font-medium" style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}>
              {k.label}
            </button>
          )
        })}
        <span className="ml-2 shrink-0">Ширина:</span>
        {PATH_WIDTHS.map((w) => {
          const active = pathWidth === w.mm
          return (
            <button key={w.mm} type="button" onClick={() => setPathWidth(w.mm)} className="shrink-0 rounded-lg px-2.5 py-1 font-medium" style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}>
              {w.label}
            </button>
          )
        })}
        <span className="shrink-0">— клик ставит точки, повторный клик в конце или Enter — готово</span>
      </Shell>
    )
  }
  if (tool === "pave") {
    return (
      <Shell>
        <span className="shrink-0">Площадка:</span>
        {PAVE_MATERIALS.map((m) => {
          const active = paveMaterial === m.id
          const def = MATERIALS[m.id]
          return (
            <button key={m.id} type="button" onClick={() => setPaveMaterial(m.id)} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-medium" style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}>
              {def && <span className="h-3.5 w-3.5 rounded" style={{ background: def.color, border: "1px solid rgba(0,0,0,0.2)" }} />}
              {m.label}
            </button>
          )
        })}
        <span className="shrink-0">— клик ставит точки контура, клик у старта или Enter — залить, Esc — отмена</span>
      </Shell>
    )
  }
  if (tool === "fence") {
    return (
      <Shell>
        <span className="shrink-0">Забор:</span>
        {FENCE_STYLES.map((f) => {
          const active = fenceStyle === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFenceStyle(f.id)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {f.label}
            </button>
          )
        })}
        <span className="shrink-0">— клик ставит точки, повторный клик в конце или Enter — готово</span>
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
