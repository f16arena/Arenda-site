"use client"

// ADR: Нижняя строка статуса (§5.7): активный уровень, инструмент, подсказка управления,
// бренд/фаза. FPS-метрика в dev и координаты курсора — Фаза 2.

import { useDocumentStore, useEditorStore, type Tool } from "@/store/builder-store"
import { findFloor } from "@/core/document/commands"
import { TOKENS } from "@/lib/builder/materials"

const TOOL_RU: Record<Tool, string> = {
  select: "Выбор",
  wall: "Стена",
  room: "Комната",
  floor: "Этаж",
  door: "Дверь",
  window: "Окно",
  stair: "Лестница",
  roof: "Крыша",
  terrain: "Рельеф",
  road: "Дорога",
  parking: "Парковка",
  fence: "Забор",
  tree: "Озеленение",
  object: "Объект",
  material: "Материал",
  link: "Помещение",
  water: "Вода",
  pave: "Площадка",
  delete: "Удалить",
}

export function StatusBar() {
  const doc = useDocumentStore((s) => s.doc)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const activeTool = useEditorStore((s) => s.activeTool)
  const level = activeLevelId === "site" ? "Участок" : findFloor(doc, activeLevelId)?.name ?? "—"

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-1.5 text-[11px] backdrop-blur-xl"
      style={{ background: TOKENS.panel, borderTop: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.muted }}
    >
      <div className="flex items-center gap-4">
        <span>
          Уровень: <b style={{ color: TOKENS.text }}>{level}</b>
        </span>
        <span>
          Инструмент: <b style={{ color: TOKENS.accent }}>{TOOL_RU[activeTool]}</b>
        </span>
      </div>
      <div className="hidden items-center gap-4 md:flex">
        <span>ЛКМ — выбрать · Стена: клик-клик · Колесо — зум · ПКМ — пан</span>
      </div>
      <div className="flex items-center gap-2">
        <span style={{ color: TOKENS.accent2 }}>Building Studio</span>
        <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(56,189,248,0.15)", color: TOKENS.accent }}>Фаза 1</span>
      </div>
    </div>
  )
}
