"use client"

// ADR: Левая панель уровней (§5.4). Список этажей (сверху вниз) + «Участок», активный
// уровень, режимы отображения (всё/активный/срез/призрак), «стены вниз», добавление
// этажа копией плана нижнего (remapGraph — свежие id, без коллизий мешей).

import { Building2, Layers, Plus, Trees } from "lucide-react"
import { uid } from "@/core/id"
import { emptyGraph, remapGraph } from "@/core/geometry/wall-graph"
import { AddFloorCommand } from "@/core/document/commands"
import type { Floor } from "@/types/builder"
import { useDocumentStore, useEditorStore, type DisplayMode } from "@/store/builder-store"
import { TOKENS } from "@/lib/builder/materials"

const DISPLAY: { id: DisplayMode; label: string }[] = [
  { id: "all", label: "Всё" },
  { id: "active", label: "Этаж" },
  { id: "cutaway", label: "Срез" },
  { id: "ghost", label: "Призрак" },
]

function LevelRow({ name, sub, Icon, active, onClick }: { name: string; sub?: string; Icon: typeof Layers; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-all"
      style={{ background: active ? "rgba(56,189,248,0.16)" : "transparent", border: `1px solid ${active ? TOKENS.accent : "transparent"}` }}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: active ? TOKENS.accent : TOKENS.muted }} />
      <span className="flex-1 truncate">{name}</span>
      {sub && <span className="text-[10px]" style={{ color: TOKENS.muted }}>{sub}</span>}
    </button>
  )
}

export function LevelPanel() {
  const doc = useDocumentStore((s) => s.doc)
  const execute = useDocumentStore((s) => s.execute)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const setActiveLevel = useEditorStore((s) => s.setActiveLevel)
  const displayMode = useEditorStore((s) => s.displayMode)
  const setDisplayMode = useEditorStore((s) => s.setDisplayMode)
  const wallsDown = useEditorStore((s) => s.wallsDown)
  const toggleWallsDown = useEditorStore((s) => s.toggleWallsDown)

  const building = doc.buildings[0]
  const floors = building ? [...building.floors].sort((a, b) => b.level - a.level) : []

  const addFloor = () => {
    if (!building) return
    const top = [...building.floors].sort((a, b) => a.level - b.level).pop()
    const level = (top?.level ?? 0) + 1
    const floor: Floor = {
      id: uid("f"),
      name: `${level} этаж`,
      level,
      elevation: level * 3500,
      height: 3500,
      visible: true,
      locked: false,
      opacity: 1,
      wallGraph: top ? remapGraph(top.wallGraph) : emptyGraph(),
      openings: [],
      stairs: [],
      objects: [],
      premiseLinks: {},
      floorMaterialId: "laminate",
      roomMaterials: {},
    }
    execute(new AddFloorCommand(building.id, floor))
    setActiveLevel(floor.id)
  }

  const addBasement = () => {
    if (!building) return
    const minLevel = Math.min(1, ...building.floors.map((f) => f.level))
    const level = minLevel - 1
    const floor: Floor = {
      id: uid("f"),
      name: level === 0 ? "Цоколь" : `Подвал ${level}`,
      level,
      elevation: level * 3500,
      height: 3500,
      visible: true,
      locked: false,
      opacity: 1,
      wallGraph: emptyGraph(),
      openings: [],
      stairs: [],
      objects: [],
      premiseLinks: {},
      floorMaterialId: "tile",
      roomMaterials: {},
    }
    execute(new AddFloorCommand(building.id, floor))
    setActiveLevel(floor.id)
  }

  return (
    <div
      className="absolute left-3 top-40 z-20 flex w-52 flex-col gap-1 rounded-2xl p-2 shadow-2xl backdrop-blur-xl"
      style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
    >
      <div className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: TOKENS.muted }}>
        {building?.name ?? "Проект"}
      </div>
      <div className="grid grid-cols-4 gap-1 px-0.5 pb-1">
        {DISPLAY.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDisplayMode(d.id)}
            className="rounded-lg py-1 text-[10px] font-medium transition-all"
            style={{
              background: displayMode === d.id ? TOKENS.accent : "rgba(148,163,184,0.1)",
              color: displayMode === d.id ? "#0b1220" : TOKENS.text,
            }}
          >
            {d.label}
          </button>
        ))}
      </div>
      {floors.map((f) => (
        <LevelRow
          key={f.id}
          name={f.name}
          sub={f.level <= 0 ? "цоколь" : undefined}
          Icon={f.level === 0 ? Building2 : Layers}
          active={activeLevelId === f.id}
          onClick={() => setActiveLevel(f.id)}
        />
      ))}
      <LevelRow name="Участок" Icon={Trees} active={activeLevelId === "site"} onClick={() => setActiveLevel("site")} />
      <button
        type="button"
        onClick={addFloor}
        className="mt-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all"
        style={{ background: "rgba(56,189,248,0.12)", color: TOKENS.accent, border: `1px dashed ${TOKENS.accent}` }}
      >
        <Plus className="h-3.5 w-3.5" /> Добавить этаж
      </button>
      <button
        type="button"
        onClick={addBasement}
        title="Вырыть цоколь/подвал — котлован в земле под зданием"
        className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all"
        style={{ background: "rgba(148,163,184,0.1)", color: TOKENS.muted, border: `1px dashed ${TOKENS.panelBorder}` }}
      >
        ⛏ Подвал (вниз)
      </button>
      <button
        type="button"
        onClick={toggleWallsDown}
        title="Опускать ближние стены (как в Sims) — Фаза 2"
        className="mt-0.5 rounded-xl py-1.5 text-[11px] transition-all"
        style={{ background: wallsDown ? "rgba(167,139,250,0.18)" : "rgba(148,163,184,0.08)", color: wallsDown ? TOKENS.accent2 : TOKENS.muted }}
      >
        Стены вниз {wallsDown ? "✓" : ""}
      </button>
    </div>
  )
}
