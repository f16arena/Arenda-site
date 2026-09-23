"use client"

// ADR: Верхний тулбар инструментов (§5.3). Фаза 1 активны: Выбор, Стена, Удалить + Undo/Redo.
// Остальные инструменты показаны, но помечены как «Фаза 2+» (dimmed) — честно и без обмана.

import {
  ArrowUpFromLine,
  Box,
  Building2,
  Copy,
  Eye,
  Fence,
  Layers,
  Move,
  Route,
  PencilRuler,
  Redo2,
  Scissors,
  Square,
  Trash2,
  Trees,
  Undo2,
  Waves,
  Grid3x3,
  Cable,
  Plug,
  Slice,
  Ruler,
  RectangleVertical,
  Store,
} from "lucide-react"
import { useDocumentStore, useEditorStore, type Tool } from "@/store/builder-store"
import { TOKENS } from "@/lib/builder/materials"
import { useT } from "@/lib/i18n/client"
import type { Messages } from "@/lib/i18n/messages"

// Подписи кнопок короткие: на них смотрят в две строки по 10px. Полная
// формулировка живёт в title — там место есть.
type ToolbarKey = keyof Messages["adminBuilder"]["toolbar"]
type Item = { id: Tool; label: ToolbarKey; key: string; Icon: typeof Move; phase1: boolean; shape?: "column"; hint?: ToolbarKey }
type Group = { title: ToolbarKey | ""; items: Item[] }

// Инструменты сгруппированы по смыслу и показываются по режиму: раньше в одну
// строку выпадали все 22 кнопки сразу, включая рельеф и воду в режиме «Строить».
const SELECT: Item = { id: "select", label: "select", key: "V", Icon: Move, phase1: true, hint: "selectHint" }
const DELETE: Item = { id: "delete", label: "delete", key: "Del", Icon: Trash2, phase1: true }
const MEASURE: Item = { id: "measure", label: "measure", key: "I", Icon: PencilRuler, phase1: true, hint: "measureHint" }

const BUILD_GROUPS: Group[] = [
  { title: "groupWalls", items: [
    { id: "wall", label: "wall", key: "W", Icon: PencilRuler, phase1: true },
    { id: "room", label: "room", key: "R", Icon: Square, phase1: true },
    { id: "door", label: "door", key: "D", Icon: Box, phase1: true },
    { id: "window", label: "window", key: "N", Icon: Eye, phase1: true },
    { id: "stair", label: "stair", key: "S", Icon: ArrowUpFromLine, phase1: true },
    // колонна — та же «лестница» формы column: вычитается из площади помещения
    { id: "stair", label: "column", key: "", Icon: RectangleVertical, phase1: true, shape: "column" },
  ] },
  { title: "groupRent", items: [
    // место в общей зоне: киоск, вендинг, банкомат, антенна на крыше
    { id: "island", label: "island", key: "K", Icon: Store, phase1: true, hint: "islandHint" },
    { id: "link", label: "link", key: "", Icon: Copy, phase1: true, hint: "linkHint" },
  ] },
  { title: "groupBuilding", items: [
    { id: "floor", label: "floor", key: "F", Icon: Layers, phase1: false },
    { id: "roof", label: "roof", key: "T", Icon: Building2, phase1: false },
    { id: "object", label: "object", key: "O", Icon: Box, phase1: true, hint: "objectHint" },
    { id: "material", label: "paint", key: "M", Icon: Scissors, phase1: true, hint: "paintHint" },
  ] },
  { title: "groupDrawing", items: [
    { id: "section", label: "section", key: "", Icon: Slice, phase1: true },
    { id: "annotate", label: "dimensions", key: "", Icon: Ruler, phase1: true },
  ] },
]

const SITE_GROUPS: Group[] = [
  { title: "groupSite", items: [
    { id: "terrain", label: "terrain", key: "", Icon: Trees, phase1: true },
    { id: "water", label: "water", key: "", Icon: Waves, phase1: true },
    { id: "road", label: "road", key: "", Icon: Route, phase1: true },
    { id: "pave", label: "pave", key: "", Icon: Grid3x3, phase1: true },
    { id: "fence", label: "fence", key: "", Icon: Fence, phase1: true },
    { id: "object", label: "object", key: "O", Icon: Box, phase1: true },
  ] },
]

const MEP_GROUPS: Group[] = [
  { title: "groupMep", items: [
    { id: "mep-run", label: "mepRun", key: "", Icon: Cable, phase1: true },
    { id: "mep-device", label: "mepDevice", key: "", Icon: Plug, phase1: true },
  ] },
]

function groupsFor(mode: string): Group[] {
  if (mode === "mep") return MEP_GROUPS
  if (mode === "terrain" || mode === "water" || mode === "landscape") return SITE_GROUPS
  if (mode === "buy") return [{ title: "groupCatalog", items: [{ id: "object", label: "object", key: "O", Icon: Box, phase1: true, hint: "objectCatalogHint" }] }]
  if (mode === "material") return [{ title: "groupFinish", items: [{ id: "material", label: "paint", key: "M", Icon: Scissors, phase1: true }] }]
  return BUILD_GROUPS
}

export function BuilderToolbar() {
  const { t } = useT()
  const activeTool = useEditorStore((s) => s.activeTool)
  const setTool = useEditorStore((s) => s.setTool)
  const mode = useEditorStore((s) => s.mode)
  const stairShape = useEditorStore((s) => s.stairShape)
  const setStairShape = useEditorStore((s) => s.setStairShape)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)
  const canUndo = useDocumentStore((s) => s.canUndo)
  const canRedo = useDocumentStore((s) => s.canRedo)

  return (
    // Полоса начинается справа от панели проекта (w-64 + отступы): раньше тулбар
    // центрировался по экрану и первая кнопка — «Выбор» — уходила под панель.
    <div className="pointer-events-none absolute left-[17.5rem] right-3 top-16 z-30 flex justify-center">
    <div
      className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl px-2 py-1.5 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      {[{ title: "" as const, items: [SELECT] }, ...groupsFor(mode), { title: "" as const, items: [DELETE, MEASURE] }].map((g, gi) => (
        <div key={g.title || gi} className="flex shrink-0 items-center gap-1">
          {gi > 0 && <div className="mx-1 h-8 w-px" style={{ background: TOKENS.panelBorder }} />}
          {g.items.map((item) => {
            const isColumn = activeTool === "stair" && stairShape === "column"
            const active = activeTool === item.id && (item.id !== "stair" || (item.shape === "column") === isColumn)
            const label = t(`adminBuilder.toolbar.${item.label}`)
            return (
              <button
                key={item.shape ?? `${g.title}-${item.id}`}
                type="button"
                onClick={() => {
                  setTool(item.id)
                  if (item.shape) setStairShape(item.shape)
                  else if (item.id === "stair" && stairShape === "column") setStairShape("u")
                }}
                title={`${label}${item.key ? ` (${item.key})` : ""}${item.hint ? ` — ${t(`adminBuilder.toolbar.${item.hint}`)}` : ""}${item.phase1 ? "" : ` · ${t("adminBuilder.toolbar.phaseNext")}`}`}
                className="group flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px] font-medium transition-all"
                style={{
                  background: active ? TOKENS.accent : "transparent",
                  color: active ? "#0b1220" : item.phase1 ? TOKENS.text : TOKENS.muted,
                  opacity: item.phase1 || active ? 1 : 0.55,
                }}
              >
                <item.Icon className="h-4 w-4" />
                {label}
              </button>
            )
          })}
        </div>
      ))}
      <div className="mx-1 h-8 w-px" style={{ background: TOKENS.panelBorder }} />
      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        title={t("adminBuilder.toolbar.undoHint")}
        className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px]"
        style={{ color: canUndo ? TOKENS.text : TOKENS.muted, opacity: canUndo ? 1 : 0.4 }}
      >
        <Undo2 className="h-4 w-4" />
        {t("adminBuilder.toolbar.undo")}
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        title={t("adminBuilder.toolbar.redoHint")}
        className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px]"
        style={{ color: canRedo ? TOKENS.text : TOKENS.muted, opacity: canRedo ? 1 : 0.4 }}
      >
        <Redo2 className="h-4 w-4" />
        {t("adminBuilder.toolbar.redo")}
      </button>
    </div>
    </div>
  )
}
