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

type Item = { id: Tool; label: string; key: string; Icon: typeof Move; phase1: boolean; shape?: "column"; hint?: string }
type Group = { title: string; items: Item[] }

// Инструменты сгруппированы по смыслу и показываются по режиму: раньше в одну
// строку выпадали все 22 кнопки сразу, включая рельеф и воду в режиме «Строить».
const SELECT: Item = { id: "select", label: "Выбор", key: "V", Icon: Move, phase1: true, hint: "Выделить и перетащить" }
const DELETE: Item = { id: "delete", label: "Удалить", key: "Del", Icon: Trash2, phase1: true }
const MEASURE: Item = { id: "measure", label: "Линейка", key: "I", Icon: PencilRuler, phase1: true, hint: "Измерить расстояние" }

const BUILD_GROUPS: Group[] = [
  { title: "Стены и комнаты", items: [
    { id: "wall", label: "Стена", key: "W", Icon: PencilRuler, phase1: true },
    { id: "room", label: "Комната", key: "R", Icon: Square, phase1: true },
    { id: "door", label: "Дверь", key: "D", Icon: Box, phase1: true },
    { id: "window", label: "Окно", key: "N", Icon: Eye, phase1: true },
    { id: "stair", label: "Лестница", key: "S", Icon: ArrowUpFromLine, phase1: true },
    // колонна — та же «лестница» формы column: вычитается из площади помещения
    { id: "stair", label: "Колонна", key: "", Icon: RectangleVertical, phase1: true, shape: "column" },
  ] },
  { title: "Аренда", items: [
    // место в общей зоне: киоск, вендинг, банкомат, антенна на крыше
    { id: "island", label: "Место", key: "K", Icon: Store, phase1: true, hint: "Киоск, вендинг, антенна — место без стен" },
    { id: "link", label: "Помещение", key: "", Icon: Copy, phase1: true, hint: "Связать комнату с карточкой помещения" },
  ] },
  { title: "Здание", items: [
    { id: "floor", label: "Этаж", key: "F", Icon: Layers, phase1: false },
    { id: "roof", label: "Крыша", key: "T", Icon: Building2, phase1: false },
    { id: "object", label: "Объект", key: "O", Icon: Box, phase1: true, hint: "Мебель и оборудование из каталога" },
    { id: "material", label: "Покрасить", key: "M", Icon: Scissors, phase1: true, hint: "Материал стены, пола, крыши" },
  ] },
  { title: "Чертёж", items: [
    { id: "section", label: "Разрез", key: "", Icon: Slice, phase1: true },
    { id: "annotate", label: "Размеры", key: "", Icon: Ruler, phase1: true },
  ] },
]

const SITE_GROUPS: Group[] = [
  { title: "Территория", items: [
    { id: "terrain", label: "Рельеф", key: "", Icon: Trees, phase1: true },
    { id: "water", label: "Вода", key: "", Icon: Waves, phase1: true },
    { id: "road", label: "Дорога", key: "", Icon: Route, phase1: true },
    { id: "pave", label: "Площадка", key: "", Icon: Grid3x3, phase1: true },
    { id: "fence", label: "Забор", key: "", Icon: Fence, phase1: true },
    { id: "object", label: "Объект", key: "O", Icon: Box, phase1: true },
  ] },
]

const MEP_GROUPS: Group[] = [
  { title: "Сети", items: [
    { id: "mep-run", label: "Трасса", key: "", Icon: Cable, phase1: true },
    { id: "mep-device", label: "Прибор", key: "", Icon: Plug, phase1: true },
  ] },
]

function groupsFor(mode: string): Group[] {
  if (mode === "mep") return MEP_GROUPS
  if (mode === "terrain" || mode === "water" || mode === "landscape") return SITE_GROUPS
  if (mode === "buy") return [{ title: "Каталог", items: [{ id: "object", label: "Объект", key: "O", Icon: Box, phase1: true, hint: "Выберите предмет в каталоге снизу" }] }]
  if (mode === "material") return [{ title: "Отделка", items: [{ id: "material", label: "Покрасить", key: "M", Icon: Scissors, phase1: true }] }]
  return BUILD_GROUPS
}

export function BuilderToolbar() {
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
      {[{ title: "", items: [SELECT] }, ...groupsFor(mode), { title: "", items: [DELETE, MEASURE] }].map((g, gi) => (
        <div key={g.title || gi} className="flex shrink-0 items-center gap-1">
          {gi > 0 && <div className="mx-1 h-8 w-px" style={{ background: TOKENS.panelBorder }} />}
          {g.items.map((t) => {
            const isColumn = activeTool === "stair" && stairShape === "column"
            const active = activeTool === t.id && (t.id !== "stair" || (t.shape === "column") === isColumn)
            return (
              <button
                key={t.shape ?? `${g.title}-${t.id}`}
                type="button"
                onClick={() => {
                  setTool(t.id)
                  if (t.shape) setStairShape(t.shape)
                  else if (t.id === "stair" && stairShape === "column") setStairShape("u")
                }}
                title={`${t.label}${t.key ? ` (${t.key})` : ""}${t.hint ? ` — ${t.hint}` : ""}${t.phase1 ? "" : " · Фаза 2+"}`}
                className="group flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px] font-medium transition-all"
                style={{
                  background: active ? TOKENS.accent : "transparent",
                  color: active ? "#0b1220" : t.phase1 ? TOKENS.text : TOKENS.muted,
                  opacity: t.phase1 || active ? 1 : 0.55,
                }}
              >
                <t.Icon className="h-4 w-4" />
                {t.label}
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
        title="Отменить (Ctrl+Z)"
        className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px]"
        style={{ color: canUndo ? TOKENS.text : TOKENS.muted, opacity: canUndo ? 1 : 0.4 }}
      >
        <Undo2 className="h-4 w-4" />
        Отмена
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        title="Повторить (Ctrl+Shift+Z)"
        className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px]"
        style={{ color: canRedo ? TOKENS.text : TOKENS.muted, opacity: canRedo ? 1 : 0.4 }}
      >
        <Redo2 className="h-4 w-4" />
        Повтор
      </button>
    </div>
    </div>
  )
}
