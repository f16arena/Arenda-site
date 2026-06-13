"use client"

// ADR: Верхний тулбар инструментов (§5.3). Фаза 1 активны: Выбор, Стена, Удалить + Undo/Redo.
// Остальные инструменты показаны, но помечены как «Фаза 2+» (dimmed) — честно и без обмана.

import {
  ArrowUpFromLine,
  Box,
  Building2,
  Copy,
  Eye,
  Layers,
  Move,
  PencilRuler,
  Redo2,
  Scissors,
  Square,
  Trash2,
  Trees,
  Undo2,
} from "lucide-react"
import { useDocumentStore, useEditorStore, type Tool } from "@/store/builder-store"
import { TOKENS } from "@/lib/builder/materials"

type Item = { id: Tool; label: string; key: string; Icon: typeof Move; phase1: boolean }

const TOOLS: Item[] = [
  { id: "select", label: "Выбор", key: "V", Icon: Move, phase1: true },
  { id: "wall", label: "Стена", key: "W", Icon: PencilRuler, phase1: true },
  { id: "room", label: "Комната", key: "R", Icon: Square, phase1: true },
  { id: "floor", label: "Этаж", key: "F", Icon: Layers, phase1: false },
  { id: "door", label: "Дверь", key: "D", Icon: Box, phase1: true },
  { id: "window", label: "Окно", key: "N", Icon: Eye, phase1: true },
  { id: "stair", label: "Лестница", key: "S", Icon: ArrowUpFromLine, phase1: true },
  { id: "roof", label: "Крыша", key: "T", Icon: Building2, phase1: false },
  { id: "terrain", label: "Рельеф", key: "", Icon: Trees, phase1: true },
  { id: "object", label: "Объект", key: "O", Icon: Box, phase1: true },
  { id: "material", label: "Ведро", key: "M", Icon: Scissors, phase1: true },
  { id: "link", label: "Помещение", key: "", Icon: Copy, phase1: true },
  { id: "delete", label: "Удалить", key: "Del", Icon: Trash2, phase1: true },
]

export function BuilderToolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setTool = useEditorStore((s) => s.setTool)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)
  const canUndo = useDocumentStore((s) => s.canUndo)
  const canRedo = useDocumentStore((s) => s.canRedo)

  return (
    <div
      className="absolute left-1/2 top-16 z-30 flex max-w-[92vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl px-2 py-1.5 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      {TOOLS.map((t) => {
        const active = activeTool === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTool(t.id)}
            title={`${t.label}${t.key ? ` (${t.key})` : ""}${t.phase1 ? "" : " · Фаза 2+"}`}
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
  )
}
