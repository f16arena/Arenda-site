"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { saveFloorLayout } from "@/app/actions/floor-layout"
import { Save, Plus, Trash2, RotateCcw, Grid } from "lucide-react"

const CELL = 32 // px per grid cell

type ElementType = "room" | "toilet" | "hallway" | "stairs" | "elevator" | "reception" | "wall"

type FloorElement = {
  id: string
  type: ElementType
  x: number // grid col
  y: number // grid row
  w: number // width in cells
  h: number // height in cells
  label: string
  spaceId?: string
  color?: string
}

type Layout = {
  cols: number
  rows: number
  elements: FloorElement[]
}

const TYPE_CONFIG: Record<ElementType, { label: string; color: string; bg: string; border: string }> = {
  room:      { label: "Кабинет",   color: "text-blue-800",   bg: "bg-blue-50",     border: "border-blue-300" },
  toilet:    { label: "Туалет",    color: "text-slate-700",  bg: "bg-slate-200",   border: "border-slate-400" },
  hallway:   { label: "Коридор",   color: "text-slate-500",  bg: "bg-slate-50",    border: "border-dashed border-slate-300" },
  stairs:    { label: "Лестница",  color: "text-amber-700",  bg: "bg-amber-50",    border: "border-amber-300" },
  elevator:  { label: "Лифт",      color: "text-purple-700", bg: "bg-purple-50",   border: "border-purple-300" },
  reception: { label: "Ресепшн",   color: "text-emerald-700",bg: "bg-emerald-50",  border: "border-emerald-300" },
  wall:      { label: "Стена",     color: "text-slate-900",  bg: "bg-slate-700",   border: "border-slate-800" },
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function FloorEditor({
  floorId,
  floorName,
  initialLayout,
  spaces,
}: {
  floorId: string
  floorName: string
  initialLayout: Layout | null
  spaces: { id: string; number: string; status: string }[]
}) {
  const DEFAULT_LAYOUT: Layout = {
    cols: 24,
    rows: 16,
    elements: spaces.map((s, i) => ({
      id: uid(),
      type: "room",
      x: (i % 4) * 5,
      y: Math.floor(i / 4) * 4,
      w: 4,
      h: 3,
      label: `Каб. ${s.number}`,
      spaceId: s.id,
    })),
  }

  const [layout, setLayout] = useState<Layout>(initialLayout ?? DEFAULT_LAYOUT)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; offX: number; offY: number } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; edge: "se" } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addType, setAddType] = useState<ElementType>("room")
  const gridRef = useRef<HTMLDivElement>(null)

  const getGridPos = useCallback((clientX: number, clientY: number) => {
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return { col: 0, row: 0 }
    return {
      col: Math.floor((clientX - rect.left) / CELL),
      row: Math.floor((clientY - rect.top) / CELL),
    }
  }, [])

  const handleGridMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      const { col, row } = getGridPos(e.clientX, e.clientY)
      setLayout((prev) => ({
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === dragging.id
            ? {
                ...el,
                x: Math.max(0, Math.min(col - dragging.offX, prev.cols - el.w)),
                y: Math.max(0, Math.min(row - dragging.offY, prev.rows - el.h)),
              }
            : el
        ),
      }))
    }
    if (resizing) {
      const { col, row } = getGridPos(e.clientX, e.clientY)
      setLayout((prev) => ({
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === resizing.id
            ? { ...el, w: Math.max(1, col - el.x + 1), h: Math.max(1, row - el.y + 1) }
            : el
        ),
      }))
    }
  }, [dragging, resizing, getGridPos])

  const handleGridMouseUp = useCallback(() => {
    setDragging(null)
    setResizing(null)
  }, [])

  function addElement() {
    const newEl: FloorElement = {
      id: uid(),
      type: addType,
      x: 0,
      y: 0,
      w: addType === "hallway" ? 20 : addType === "wall" ? 1 : 4,
      h: addType === "hallway" ? 2 : addType === "wall" ? 6 : 3,
      label: TYPE_CONFIG[addType].label,
    }
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, newEl] }))
    setSelected(newEl.id)
  }

  function deleteElement(id: string) {
    setLayout((prev) => ({ ...prev, elements: prev.elements.filter((e) => e.id !== id) }))
    setSelected(null)
  }

  function updateElement(id: string, patch: Partial<FloorElement>) {
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    }))
  }

  async function handleSave() {
    setSaving(true)
    await saveFloorLayout(floorId, JSON.stringify(layout))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const selectedEl = layout.elements.find((e) => e.id === selected)

  return (
    <div className="flex gap-4 h-[calc(100vh-140px)]">
      {/* Left panel */}
      <div className="w-56 shrink-0 flex flex-col gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Добавить элемент</p>
          <select
            value={addType}
            onChange={(e) => setAddType(e.target.value as ElementType)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
          >
            {(Object.keys(TYPE_CONFIG) as ElementType[]).map((t) => (
              <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
            ))}
          </select>
          <button
            onClick={addElement}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Добавить
          </button>
        </div>

        {/* Selected element editor */}
        {selectedEl && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Свойства</p>
              <button onClick={() => deleteElement(selectedEl.id)} className="text-red-400 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Подпись</label>
              <input
                value={selectedEl.label}
                onChange={(e) => updateElement(selectedEl.id, { label: e.target.value })}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Тип</label>
              <select
                value={selectedEl.type}
                onChange={(e) => updateElement(selectedEl.id, { type: e.target.value as ElementType })}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm bg-white"
              >
                {(Object.keys(TYPE_CONFIG) as ElementType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">X (кол)</label>
                <input type="number" value={selectedEl.x} onChange={(e) => updateElement(selectedEl.id, { x: parseInt(e.target.value) || 0 })}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Y (ряд)</label>
                <input type="number" value={selectedEl.y} onChange={(e) => updateElement(selectedEl.id, { y: parseInt(e.target.value) || 0 })}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ширина</label>
                <input type="number" min="1" value={selectedEl.w} onChange={(e) => updateElement(selectedEl.id, { w: parseInt(e.target.value) || 1 })}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Высота</label>
                <input type="number" min="1" value={selectedEl.h} onChange={(e) => updateElement(selectedEl.id, { h: parseInt(e.target.value) || 1 })}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm" />
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Сетка</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Колонок</label>
              <input type="number" min="10" max="40" value={layout.cols}
                onChange={(e) => setLayout((p) => ({ ...p, cols: parseInt(e.target.value) || 24 }))}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Рядов</label>
              <input type="number" min="8" max="30" value={layout.rows}
                onChange={(e) => setLayout((p) => ({ ...p, rows: parseInt(e.target.value) || 16 }))}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Editor canvas */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            <span className="font-medium text-slate-700">{floorName}</span>
            {" "}· Перетаскивайте элементы мышью · Угол для изменения размера
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              saved ? "bg-emerald-600 text-white" : "bg-slate-900 text-white hover:bg-slate-800"
            } disabled:opacity-60`}
          >
            <Save className="h-4 w-4" />
            {saving ? "Сохранение..." : saved ? "Сохранено!" : "Сохранить"}
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 rounded-xl border border-slate-200 p-4">
          <div
            ref={gridRef}
            className="relative bg-white border border-slate-300 rounded-lg select-none"
            style={{
              width: layout.cols * CELL,
              height: layout.rows * CELL,
              backgroundImage: `
                linear-gradient(to right, #e2e8f0 1px, transparent 1px),
                linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)
              `,
              backgroundSize: `${CELL}px ${CELL}px`,
            }}
            onMouseMove={handleGridMouseMove}
            onMouseUp={handleGridMouseUp}
            onMouseLeave={handleGridMouseUp}
            onClick={(e) => {
              if (e.target === gridRef.current) setSelected(null)
            }}
          >
            {layout.elements.map((el) => {
              const cfg = TYPE_CONFIG[el.type]
              const isSelected = el.id === selected
              return (
                <div
                  key={el.id}
                  className={`absolute border-2 rounded flex flex-col items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden transition-shadow ${cfg.bg} ${cfg.border} ${cfg.color} ${
                    isSelected ? "ring-2 ring-blue-500 shadow-lg z-10" : "hover:shadow-md z-0"
                  } ${el.type === "wall" ? "bg-slate-700" : ""}`}
                  style={{
                    left: el.x * CELL,
                    top: el.y * CELL,
                    width: el.w * CELL,
                    height: el.h * CELL,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const { col, row } = getGridPos(e.clientX, e.clientY)
                    setSelected(el.id)
                    if ((e.target as HTMLElement).dataset.resize) return
                    setDragging({ id: el.id, offX: col - el.x, offY: row - el.y })
                  }}
                >
                  <p className={`text-[11px] font-semibold text-center px-1 leading-tight ${el.type === "wall" ? "text-white" : ""}`}>
                    {el.label}
                  </p>
                  {/* Resize handle */}
                  <div
                    data-resize="se"
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setSelected(el.id)
                      setResizing({ id: el.id, edge: "se" })
                    }}
                  >
                    <div className="w-2 h-2 bg-blue-500 rounded-sm opacity-50 hover:opacity-100" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
