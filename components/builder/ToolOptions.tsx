"use client"

// ADR: Контекстные опции активного инструмента (под тулбаром): палитра материалов для
// «ведра», форма лестницы, подсказки для стены/проёмов. Управляет editorStore.

import { useEffect } from "react"
import { ISLAND_KINDS, MEP_SYSTEMS } from "@/types/builder"
import { MEP_SYSTEM_INFO, devicesOf } from "@/lib/builder/mep/catalog"
import { useEditorStore, type StairShape, type TerrainMode, type FenceStyle } from "@/store/builder-store"
import { MATERIALS, TOKENS, materialNameKey } from "@/lib/builder/materials"
import { presetsFor } from "@/lib/builder/openings"
import { ISLAND_PRESETS, OUTDOOR_KINDS, ROOF_KINDS } from "@/lib/builder/islands"
import { useT } from "@/lib/i18n/client"
import type { Messages } from "@/lib/i18n/messages"

type OptionsKey = keyof Messages["adminBuilder"]["options"]

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
// Подписи кнопок — ключи словаря (adminBuilder.options): подписи в двух языках
// в таблице пресетов держать негде.
const STAIRS: { id: StairShape; label: OptionsKey }[] = [
  { id: "straight", label: "stairStraight" },
  { id: "l", label: "stairL" },
  { id: "u", label: "stairU" },
  { id: "porch", label: "stairPorch" },
  { id: "ramp", label: "stairRamp" },
  { id: "elevator", label: "stairElevator" },
  { id: "column", label: "stairColumn" },
]
const TERRAIN: { id: TerrainMode; label: OptionsKey }[] = [
  { id: "raise", label: "terrainRaise" },
  { id: "lower", label: "terrainLower" },
  { id: "flatten", label: "terrainFlatten" },
  { id: "smooth", label: "terrainSmooth" },
  { id: "terrace", label: "terrainTerrace" },
]
const WATER_DEPTHS: { mm: number; label: OptionsKey }[] = [
  { mm: 400, label: "waterShallow" },
  { mm: 800, label: "waterMedium" },
  { mm: 1500, label: "waterDeep" },
]
// Ширина дорожки — только цифры, переводить нечего.
const PATH_WIDTHS: { mm: number; label: string }[] = [
  { mm: 1200, label: "1.2 м" },
  { mm: 3000, label: "3 м" },
  { mm: 6000, label: "6 м" },
]
const PAVE_MATERIALS: { id: string; label: OptionsKey }[] = [
  { id: "asphalt", label: "paveAsphalt" },
  { id: "paving", label: "pavePaving" },
  { id: "concrete", label: "paveConcrete" },
  { id: "tile", label: "paveTile" },
  { id: "granite", label: "paveGranite" },
  { id: "grass", label: "paveGrass" },
]
const FENCE_STYLES: { id: FenceStyle; label: OptionsKey }[] = [
  { id: "profnastil", label: "fenceProfnastil" },
  { id: "shtaketnik", label: "fenceShtaketnik" },
  { id: "mesh", label: "fenceMesh" },
  { id: "forged", label: "fenceForged" },
  { id: "wood", label: "fenceWood" },
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
  const { t } = useT()
  const wallArc = useEditorStore((st) => st.wallArc)
  const tool = useEditorStore((s) => s.activeTool)
  const paintMaterialId = useEditorStore((s) => s.paintMaterialId)
  const setPaintMaterial = useEditorStore((s) => s.setPaintMaterial)
  const stairShape = useEditorStore((s) => s.stairShape)
  const setStairShape = useEditorStore((s) => s.setStairShape)
  const islandKind = useEditorStore((s) => s.islandKind)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  // ушли на участок — переключаем вид места на парковку и наоборот: иначе
  // клик поставил бы вендинг посреди двора
  useEffect(() => {
    const onSite = activeLevelId === "site"
    if (!ROOF_KINDS.has(islandKind) && OUTDOOR_KINDS.has(islandKind) !== onSite) {
      useEditorStore.getState().setIslandKind(onSite ? "parking" : "vending")
    }
  }, [activeLevelId, islandKind])
  const setIslandKind = useEditorStore((s) => s.setIslandKind)
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

  if (tool === "annotate") {
    return <AnnotateOptions />
  }
  if (tool === "mep-run" || tool === "mep-device") {
    return <MepToolOptions tool={tool} />
  }
  if (tool === "terrain") {
    return (
      <Shell>
        <span className="shrink-0">{t("adminBuilder.options.terrain")}</span>
        {TERRAIN.map((row) => {
          const active = terrainMode === row.id
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setTerrainMode(row.id)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {t(`adminBuilder.options.${row.label}`)}
            </button>
          )
        })}
        <span className="shrink-0">{t("adminBuilder.options.terrainHint")}</span>
      </Shell>
    )
  }
  if (tool === "water") {
    return (
      <Shell>
        <span className="shrink-0">{t("adminBuilder.options.waterDepth")}</span>
        {WATER_DEPTHS.map((row) => {
          const active = waterDepth === row.mm
          return (
            <button
              key={row.mm}
              type="button"
              onClick={() => setWaterDepth(row.mm)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {t(`adminBuilder.options.${row.label}`)}
            </button>
          )
        })}
        <span className="shrink-0">{t("adminBuilder.options.contourHint")}</span>
      </Shell>
    )
  }
  if (tool === "road") {
    return (
      <Shell>
        <span className="shrink-0">{t("adminBuilder.options.pathKind")}</span>
        {([{ id: "road", label: "pathRoad" }, { id: "path", label: "pathWalk" }] as const).map((row) => {
          const active = pathKind === row.id
          return (
            <button key={row.id} type="button" onClick={() => setPathKind(row.id)} className="shrink-0 rounded-lg px-2.5 py-1 font-medium" style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}>
              {t(`adminBuilder.options.${row.label}`)}
            </button>
          )
        })}
        <span className="ml-2 shrink-0">{t("adminBuilder.options.pathWidth")}</span>
        {PATH_WIDTHS.map((row) => {
          const active = pathWidth === row.mm
          return (
            <button key={row.mm} type="button" onClick={() => setPathWidth(row.mm)} className="shrink-0 rounded-lg px-2.5 py-1 font-medium" style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}>
              {row.label}
            </button>
          )
        })}
        <span className="shrink-0">{t("adminBuilder.options.polylineHint")}</span>
      </Shell>
    )
  }
  if (tool === "pave") {
    return (
      <Shell>
        <span className="shrink-0">{t("adminBuilder.options.pave")}</span>
        {PAVE_MATERIALS.map((row) => {
          const active = paveMaterial === row.id
          const def = MATERIALS[row.id]
          return (
            <button key={row.id} type="button" onClick={() => setPaveMaterial(row.id)} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-medium" style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}>
              {def && <span className="h-3.5 w-3.5 rounded" style={{ background: def.color, border: "1px solid rgba(0,0,0,0.2)" }} />}
              {t(`adminBuilder.options.${row.label}`)}
            </button>
          )
        })}
        <span className="shrink-0">{t("adminBuilder.options.contourHint")}</span>
      </Shell>
    )
  }
  if (tool === "fence") {
    return (
      <Shell>
        <span className="shrink-0">{t("adminBuilder.options.fence")}</span>
        {FENCE_STYLES.map((row) => {
          const active = fenceStyle === row.id
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setFenceStyle(row.id)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {t(`adminBuilder.options.${row.label}`)}
            </button>
          )
        })}
        <span className="shrink-0">{t("adminBuilder.options.polylineHint")}</span>
      </Shell>
    )
  }
  if (tool === "object") {
    return <Shell><span>{armedAsset ? t("adminBuilder.options.objectArmed") : t("adminBuilder.options.objectPick")}</span></Shell>
  }

  if (tool === "material") {
    return (
      <Shell>
        <span className="shrink-0">{t("adminBuilder.options.material")}</span>
        {PAINT_IDS.map((id) => {
          const def = MATERIALS[id]
          const active = paintMaterialId === id
          const name = t(`adminBuilder.materials.${materialNameKey(id)}`)
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPaintMaterial(id)}
              title={name}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1"
              style={{ background: active ? "rgba(56,189,248,0.18)" : "transparent", border: `1px solid ${active ? TOKENS.accent : "transparent"}` }}
            >
              <span className="h-4 w-4 rounded" style={{ background: def.color, border: "1px solid rgba(0,0,0,0.2)" }} />
              <span className="whitespace-nowrap" style={{ color: active ? TOKENS.text : TOKENS.muted }}>{name}</span>
            </button>
          )
        })}
      </Shell>
    )
  }
  if (tool === "island") {
    // на участке предлагаем парковку, на этаже — места внутри и рекламу:
    // весь список сразу не влезает в строку и путает
    const onSite = activeLevelId === "site"
    const onRoof = activeLevelId === "roof"
    // на участке: парковка, киоски, контейнеры и места на кровле; на этаже —
    // всё, что внутри помещений
    // кровельные места нужны и с этажа (крыша видна сверху), поэтому они
    // в обоих списках; на участке — территория и кровля, на этаже — внутренние
    const kinds = onRoof
      ? ISLAND_KINDS.filter((k) => ROOF_KINDS.has(k))
      : ISLAND_KINDS.filter((k) => ROOF_KINDS.has(k) || OUTDOOR_KINDS.has(k) === onSite)
    const kind = kinds.includes(islandKind) ? islandKind : kinds[0]
    return (
      <Shell>
        <span className="shrink-0">{onRoof ? t("adminBuilder.options.islandRoof") : onSite ? t("adminBuilder.options.islandSite") : t("adminBuilder.options.islandFloor")}</span>
        {kinds.map((k) => {
          const active = kind === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => setIslandKind(k)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {t(`adminBuilder.islands.kinds.${k}`)}
            </button>
          )
        })}
        <span className="shrink-0">
          {t("adminBuilder.options.islandSize", {
            where: onRoof ? t("adminBuilder.options.islandHintRoof") : onSite ? t("adminBuilder.options.islandHintSite") : t("adminBuilder.options.islandHintFloor"),
            width: ISLAND_PRESETS[kind].width,
            depth: ISLAND_PRESETS[kind].depth,
          })}
        </span>
      </Shell>
    )
  }
  if (tool === "stair") {
    return (
      <Shell>
        <span className="shrink-0">{t("adminBuilder.options.stair")}</span>
        {STAIRS.map((row) => {
          const active = stairShape === row.id
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setStairShape(row.id)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {t(`adminBuilder.options.${row.label}`)}
            </button>
          )
        })}
        <span className="shrink-0">
          {stairShape === "ramp"
            ? t("adminBuilder.options.stairHintRamp")
            : stairShape === "porch"
              ? t("adminBuilder.options.stairHintPorch")
              : stairShape === "column"
                ? t("adminBuilder.options.stairHintColumn")
                : stairShape === "elevator"
                  ? t("adminBuilder.options.stairHintElevator")
                  : t("adminBuilder.options.stairHintDefault")}
        </span>
      </Shell>
    )
  }
  if (tool === "wall") {
    return (
      <Shell>
        <button
          type="button"
          onClick={() => useEditorStore.getState().toggleWallArc()}
          className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
          style={{ background: !wallArc ? TOKENS.accent : "rgba(148,163,184,0.1)", color: !wallArc ? "#0b1220" : TOKENS.text }}
        >
          {t("adminBuilder.options.wallStraight")}
        </button>
        <button
          type="button"
          onClick={() => useEditorStore.getState().toggleWallArc()}
          className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
          style={{ background: wallArc ? TOKENS.accent : "rgba(148,163,184,0.1)", color: wallArc ? "#0b1220" : TOKENS.text }}
        >
          {t("adminBuilder.options.wallArc")}
        </button>
        <span>{wallArc ? t("adminBuilder.options.wallArcHint") : t("adminBuilder.options.wallHint")}</span>
      </Shell>
    )
  }
  if (tool === "room") {
    return <Shell><span>{t("adminBuilder.options.roomHint")}</span></Shell>
  }
  if (tool === "door" || tool === "window") {
    const presets = presetsFor(tool)
    return (
      <Shell>
        <span className="shrink-0">{tool === "door" ? t("adminBuilder.options.door") : t("adminBuilder.options.window")}</span>
        {presets.map((preset) => {
          const active = openingVariant === preset.variant
          return (
            <button
              key={preset.variant}
              type="button"
              onClick={() => setOpeningVariant(preset.variant)}
              className="shrink-0 rounded-lg px-2.5 py-1 font-medium"
              style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
            >
              {t(`adminBuilder.openingPresets.${preset.label}`)}
            </button>
          )
        })}
        <span className="shrink-0">{t("adminBuilder.options.openingHint")}</span>
      </Shell>
    )
  }
  if (tool === "select") {
    return <Shell><span>{t("adminBuilder.options.selectHint")}</span></Shell>
  }
  return null
}

function MepToolOptions({ tool }: { tool: "mep-run" | "mep-device" }) {
  const { t } = useT()
  const system = useEditorStore((s) => s.mepSystem)
  const setSystem = useEditorStore((s) => s.setMepSystem)
  const kind = useEditorStore((s) => s.mepDeviceKind)
  const setKind = useEditorStore((s) => s.setMepDeviceKind)
  const info = MEP_SYSTEM_INFO[system]
  return (
    <div
      className="absolute left-1/2 top-[7rem] z-20 flex max-w-[92vw] -translate-x-1/2 flex-col gap-1.5 rounded-xl px-2.5 py-1.5 text-xs shadow-xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.muted }}
    >
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <span className="shrink-0">{t("adminBuilder.options.mepSystem")}</span>
        {MEP_SYSTEMS.map((sys) => {
          const it = MEP_SYSTEM_INFO[sys]
          const active = sys === system
          const name = t(`adminBuilder.mep.systems.${sys}`)
          return (
            <button
              key={sys}
              type="button"
              onClick={() => setSystem(sys)}
              title={`${it.section} · ${name}`}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-medium"
              style={{ background: active ? it.color : "rgba(148,163,184,0.1)", color: active ? "#fff" : TOKENS.text }}
            >
              {!active && <span className="h-2 w-2 rounded-sm" style={{ background: it.color }} />}
              {name}
            </button>
          )
        })}
      </div>
      {tool === "mep-device" ? (
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="shrink-0">{t("adminBuilder.options.mepDevice")}</span>
          {devicesOf(system).map((device) => {
            const active = device.kind === kind
            return (
              <button
                key={device.kind}
                type="button"
                onClick={() => setKind(device.kind)}
                className="shrink-0 whitespace-nowrap rounded-lg px-2 py-1 font-medium"
                style={{ background: active ? TOKENS.accent : "rgba(148,163,184,0.1)", color: active ? "#0b1220" : TOKENS.text }}
              >
                {t(`adminBuilder.mep.devices.${device.kind}`)}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="shrink-0">
          {t("adminBuilder.options.mepRunHint", {
            noun: t(`adminBuilder.mep.runNouns.${info.shape}`),
            size: info.size,
            height: (info.runHeight / 1000).toFixed(2).replace(".", ","),
          })}
        </div>
      )}
    </div>
  )
}

function AnnotateOptions() {
  const { t } = useT()
  const kind = useEditorStore((s) => s.annotateKind)
  const setKind = useEditorStore((s) => s.setAnnotateKind)
  return (
    <Shell>
      {([["dim", "annotateDim"], ["text", "annotateText"]] as const).map(([key, label]) => (
        <button key={key} type="button" onClick={() => setKind(key)} className="shrink-0 rounded-lg px-2.5 py-1 font-medium" style={{ background: kind === key ? TOKENS.accent : "rgba(148,163,184,0.1)", color: kind === key ? "#0b1220" : TOKENS.text }}>{t(`adminBuilder.options.${label}`)}</button>
      ))}
      <span className="shrink-0">{kind === "dim" ? t("adminBuilder.options.annotateDimHint") : t("adminBuilder.options.annotateTextHint")}</span>
    </Shell>
  )
}
