"use client"

import { useState, useRef, useEffect, useCallback, MouseEvent as ReactMouseEvent } from "react"
import { saveFloorLayout } from "@/app/actions/floor-layout"
import { toast } from "sonner"
import {
  Save, Trash2, Square, Pentagon, DoorOpen, Type, Minus,
  MousePointer2, ZoomIn, ZoomOut, Grid as GridIcon, Move, Sparkles,
  Image as ImageIcon, X as XIcon, Undo2, Redo2, Copy, MoreHorizontal,
  Eye, Layers as LayersIcon, Ruler, Box,
} from "lucide-react"
import {
  type FloorLayoutV2,
  type FloorElement,
  type Point,
  DEFAULT_LAYOUT,
  uid,
  polygonArea,
  elementCenter,
} from "@/lib/floor-layout"
import { getF16TemplateByFloorNumber } from "@/lib/f16-templates"

type Tool = "select" | "rect" | "polygon" | "door" | "window" | "label" | "wall" | "stairs" | "elevator" | "toilet"

type SpaceLite = { id: string; number: string; status: string }

const PX_PER_METER = 40 // базовый масштаб
const MIN_ZOOM = 0.3
const MAX_ZOOM = 4
const SNAP_M = 0.25 // привязка к 25 см

function snap(v: number, step = SNAP_M): number {
  return Math.round(v / step) * step
}

const STATUS_FILL: Record<string, string> = {
  VACANT: "#dcfce7",      // emerald-100
  OCCUPIED: "#dbeafe",    // blue-100
  MAINTENANCE: "#fef3c7", // amber-100
  UNLINKED: "#f8fafc",    // slate-50
}
const STATUS_STROKE: Record<string, string> = {
  VACANT: "#10b981",
  OCCUPIED: "#3b82f6",
  MAINTENANCE: "#f59e0b",
  UNLINKED: "#cbd5e1",
}

export function FloorEditor({
  floorId,
  floorName,
  floorNumber,
  initialLayout,
  spaces,
}: {
  floorId: string
  floorName: string
  floorNumber: number
  initialLayout: FloorLayoutV2 | null
  spaces: SpaceLite[]
}) {
  const f16Template = getF16TemplateByFloorNumber(floorNumber)
  const [layout, setLayoutRaw] = useState<FloorLayoutV2>(() => initialLayout ?? DEFAULT_LAYOUT)
  const [history, setHistory] = useState<FloorLayoutV2[]>([])
  const [future, setFuture] = useState<FloorLayoutV2[]>([])
  const isRestoringRef = useRef(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [tool, setTool] = useState<Tool>("select")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clipboard, setClipboardRaw] = useState<FloorElement | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [polygonInProgress, setPolygonInProgress] = useState<Point[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [underlayOpacity, setUnderlayOpacity] = useState(0.5)
  const [displayMode, setDisplayMode] = useState<"full" | "outline" | "underlay-only">("full")
  const [view3D, setView3D] = useState(false)
  const [calibration, setCalibration] = useState<{ active: boolean; first: Point | null; second: Point | null }>({
    active: false, first: null, second: null,
  })

  // setLayout с записью в историю
  const setLayout = useCallback((next: FloorLayoutV2 | ((prev: FloorLayoutV2) => FloorLayoutV2)) => {
    if (isRestoringRef.current) {
      setLayoutRaw(next)
      return
    }
    setLayoutRaw((prev) => {
      const newLayout = typeof next === "function" ? next(prev) : next
      // Push prev to history
      setHistory((h) => [...h.slice(-49), prev])
      setFuture([])
      return newLayout
    })
  }, [])

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      isRestoringRef.current = true
      setFuture((f) => [layout, ...f.slice(0, 49)])
      setLayoutRaw(prev)
      setTimeout(() => { isRestoringRef.current = false }, 0)
      return h.slice(0, -1)
    })
  }, [layout])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f
      const next = f[0]
      isRestoringRef.current = true
      setHistory((h) => [...h.slice(-49), layout])
      setLayoutRaw(next)
      setTimeout(() => { isRestoringRef.current = false }, 0)
      return f.slice(1)
    })
  }, [layout])

  const svgRef = useRef<SVGSVGElement>(null)
  const dragStateRef = useRef<{
    type: "move" | "resize-rect" | "resize-poly" | "pan" | "draw-rect" | "wall"
    elId?: string
    handle?: string
    vertexIndex?: number
    startSvg?: Point
    startEl?: FloorElement
    startPan?: Point
  } | null>(null)

  // Преобразование экранных координат в координаты SVG (метры)
  const screenToSvg = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const xPx = clientX - rect.left
    const yPx = clientY - rect.top
    return {
      x: (xPx - pan.x) / (PX_PER_METER * zoom),
      y: (yPx - pan.y) / (PX_PER_METER * zoom),
    }
  }, [pan, zoom])

  // ── Add elements ─────────────────────────────────────────────
  const addRect = (x: number, y: number, w = 4, h = 3): string => {
    const id = uid()
    setLayout((prev) => ({
      ...prev,
      elements: [
        ...prev.elements,
        { type: "rect", id, x: snap(x), y: snap(y), width: snap(w), height: snap(h), label: "" } as FloorElement,
      ],
    }))
    return id
  }

  const addDoor = (x: number, y: number): string => {
    const id = uid()
    setLayout((prev) => ({
      ...prev,
      elements: [...prev.elements, { type: "door", id, x: snap(x), y: snap(y), width: 0.9, rotation: 0, swing: "right" }],
    }))
    setSelectedId(id)
    return id
  }

  const addLabel = (x: number, y: number, text = "Текст"): string => {
    const id = uid()
    setLayout((prev) => ({
      ...prev,
      elements: [...prev.elements, { type: "label", id, x: snap(x), y: snap(y), text, fontSize: 0.5 }],
    }))
    setSelectedId(id)
    return id
  }

  const addWall = (x1: number, y1: number, x2: number, y2: number): string => {
    const id = uid()
    setLayout((prev) => ({
      ...prev,
      elements: [...prev.elements, { type: "wall", id, x1: snap(x1), y1: snap(y1), x2: snap(x2), y2: snap(y2), thickness: 0.15 }],
    }))
    setSelectedId(id)
    return id
  }

  const addPolygon = (points: Point[]): string | null => {
    if (points.length < 3) return null
    const id = uid()
    setLayout((prev) => ({
      ...prev,
      elements: [...prev.elements, { type: "polygon", id, points: points.map((p) => ({ x: snap(p.x), y: snap(p.y) })), label: "" } as FloorElement],
    }))
    setSelectedId(id)
    return id
  }

  const addWindow = (x: number, y: number) => {
    const id = uid()
    setLayout((prev) => ({
      ...prev,
      elements: [...prev.elements, { type: "window", id, x: snap(x), y: snap(y), width: 1.2, rotation: 0 }],
    }))
    setSelectedId(id)
  }

  const addIcon = (x: number, y: number, kind: "stairs" | "elevator" | "toilet") => {
    const id = uid()
    const labels = { stairs: "Лестница", elevator: "Лифт", toilet: "Туалет" }
    setLayout((prev) => ({
      ...prev,
      elements: [...prev.elements, { type: "icon", id, kind, x: snap(x), y: snap(y), size: 1.5, label: labels[kind] }],
    }))
    setSelectedId(id)
  }

  const copySelected = () => {
    const sel = layout.elements.find((e) => e.id === selectedId)
    if (!sel) return
    setClipboardRaw(sel)
    toast.success("Скопировано")
  }

  const pasteClipboard = () => {
    if (!clipboard) return
    const newId = uid()
    let cloned: FloorElement
    // Сместим вставленный элемент на 1м вправо/вниз чтобы было видно
    const offset = 1
    if (clipboard.type === "rect") {
      cloned = { ...clipboard, id: newId, x: snap(clipboard.x + offset), y: snap(clipboard.y + offset) }
    } else if (clipboard.type === "polygon") {
      cloned = {
        ...clipboard,
        id: newId,
        points: clipboard.points.map((p) => ({ x: snap(p.x + offset), y: snap(p.y + offset) })),
      }
    } else if (clipboard.type === "wall") {
      cloned = {
        ...clipboard,
        id: newId,
        x1: snap(clipboard.x1 + offset),
        y1: snap(clipboard.y1 + offset),
        x2: snap(clipboard.x2 + offset),
        y2: snap(clipboard.y2 + offset),
      }
    } else {
      cloned = { ...clipboard, id: newId, x: snap(clipboard.x + offset), y: snap(clipboard.y + offset) }
    }
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, cloned] }))
    setSelectedId(newId)
    toast.success("Вставлено")
  }

  const updateElement = (id: string, patch: Partial<FloorElement>) => {
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? ({ ...el, ...patch } as FloorElement) : el)),
    }))
  }

  const deleteElement = (id: string) => {
    setLayout((prev) => ({ ...prev, elements: prev.elements.filter((e) => e.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  // ── Mouse handlers on canvas ─────────────────────────────────
  const onSvgMouseDown = (e: ReactMouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      // Pan
      dragStateRef.current = {
        type: "pan",
        startSvg: { x: e.clientX, y: e.clientY },
        startPan: { ...pan },
      }
      return
    }

    const pt = screenToSvg(e.clientX, e.clientY)

    // Калибровка: клик отмечает 2 точки
    if (calibration.active) {
      if (!calibration.first) {
        setCalibration({ ...calibration, first: pt })
      } else if (!calibration.second) {
        const second = pt
        const first = calibration.first
        const pixelDist = Math.hypot(second.x - first.x, second.y - first.y) // в наших "метрах" (текущая шкала)
        const realStr = window.prompt(`Расстояние между точками сейчас: ${pixelDist.toFixed(2)} м.\nВведите реальное расстояние в метрах:`)
        if (realStr) {
          const realDist = parseFloat(realStr.replace(",", "."))
          if (!Number.isNaN(realDist) && realDist > 0) {
            const ratio = realDist / pixelDist
            // Масштабируем размеры холста и все элементы на ratio
            setLayout((prev) => ({
              ...prev,
              width: prev.width * ratio,
              height: prev.height * ratio,
              elements: prev.elements.map((el) => scaleElement(el, ratio)),
            }))
            toast.success(`Масштаб откалиброван: 1 → ${ratio.toFixed(3)}`)
          }
        }
        setCalibration({ active: false, first: null, second: null })
      }
      return
    }

    if (tool === "rect") {
      const id = addRect(pt.x, pt.y, 0.5, 0.5)
      dragStateRef.current = {
        type: "draw-rect",
        elId: id,
        startSvg: pt,
      }
      setSelectedId(id)
      return
    }

    if (tool === "door") {
      addDoor(pt.x, pt.y)
      setTool("select")
      return
    }

    if (tool === "window") {
      addWindow(pt.x, pt.y)
      setTool("select")
      return
    }

    if (tool === "stairs" || tool === "elevator" || tool === "toilet") {
      addIcon(pt.x, pt.y, tool)
      setTool("select")
      return
    }

    if (tool === "label") {
      const text = window.prompt("Текст подписи:", "Подпись") ?? ""
      if (text.trim()) addLabel(pt.x, pt.y, text)
      setTool("select")
      return
    }

    if (tool === "wall") {
      // Walls: click-drag from start to end
      const id = addWall(pt.x, pt.y, pt.x + 0.1, pt.y + 0.1)
      dragStateRef.current = {
        type: "wall",
        elId: id,
        startSvg: pt,
      }
      setSelectedId(id)
      return
    }

    if (tool === "polygon") {
      // Click — добавить вершину
      setPolygonInProgress((prev) => (prev ? [...prev, pt] : [pt]))
      return
    }

    // tool === "select" — клик по пустому месту снимает выделение
    setSelectedId(null)
  }

  const onSvgMouseMove = (e: ReactMouseEvent) => {
    const ds = dragStateRef.current
    if (!ds) return

    if (ds.type === "pan" && ds.startSvg && ds.startPan) {
      setPan({
        x: ds.startPan.x + (e.clientX - ds.startSvg.x),
        y: ds.startPan.y + (e.clientY - ds.startSvg.y),
      })
      return
    }

    const pt = screenToSvg(e.clientX, e.clientY)

    if (ds.type === "draw-rect" && ds.elId && ds.startSvg) {
      const x = Math.min(ds.startSvg.x, pt.x)
      const y = Math.min(ds.startSvg.y, pt.y)
      const w = Math.abs(pt.x - ds.startSvg.x)
      const h = Math.abs(pt.y - ds.startSvg.y)
      updateElement(ds.elId, { x: snap(x), y: snap(y), width: snap(w), height: snap(h) } as Partial<FloorElement>)
      return
    }

    if (ds.type === "wall" && ds.elId && ds.startSvg) {
      updateElement(ds.elId, { x2: snap(pt.x), y2: snap(pt.y) } as Partial<FloorElement>)
      return
    }

    if (ds.type === "move" && ds.elId && ds.startEl && ds.startSvg) {
      const dx = pt.x - ds.startSvg.x
      const dy = pt.y - ds.startSvg.y
      const startEl = ds.startEl
      if (startEl.type === "rect" || startEl.type === "door" || startEl.type === "window" || startEl.type === "label" || startEl.type === "icon") {
        updateElement(ds.elId, { x: snap(startEl.x + dx), y: snap(startEl.y + dy) } as Partial<FloorElement>)
      } else if (startEl.type === "polygon") {
        updateElement(ds.elId, {
          points: startEl.points.map((p) => ({ x: snap(p.x + dx), y: snap(p.y + dy) })),
        } as Partial<FloorElement>)
      } else if (startEl.type === "wall") {
        updateElement(ds.elId, {
          x1: snap(startEl.x1 + dx),
          y1: snap(startEl.y1 + dy),
          x2: snap(startEl.x2 + dx),
          y2: snap(startEl.y2 + dy),
        } as Partial<FloorElement>)
      }
      return
    }

    if (ds.type === "resize-rect" && ds.elId && ds.startEl && ds.handle && ds.startSvg) {
      const dx = pt.x - ds.startSvg.x
      const dy = pt.y - ds.startSvg.y
      const start = ds.startEl
      if (start.type !== "rect") return
      let { x, y, width, height } = start
      if (ds.handle.includes("e")) width = Math.max(0.5, start.width + dx)
      if (ds.handle.includes("s")) height = Math.max(0.5, start.height + dy)
      if (ds.handle.includes("w")) {
        x = start.x + dx
        width = Math.max(0.5, start.width - dx)
      }
      if (ds.handle.includes("n")) {
        y = start.y + dy
        height = Math.max(0.5, start.height - dy)
      }
      updateElement(ds.elId, { x: snap(x), y: snap(y), width: snap(width), height: snap(height) } as Partial<FloorElement>)
      return
    }

    if (ds.type === "resize-poly" && ds.elId && ds.startEl && ds.vertexIndex !== undefined) {
      const start = ds.startEl
      if (start.type !== "polygon") return
      const newPoints = start.points.map((p, i) =>
        i === ds.vertexIndex ? { x: snap(pt.x), y: snap(pt.y) } : p
      )
      updateElement(ds.elId, { points: newPoints } as Partial<FloorElement>)
    }
  }

  const onSvgMouseUp = () => {
    if (dragStateRef.current?.type === "draw-rect" && dragStateRef.current.elId) {
      // Если получился крошечный — удалим
      const el = layout.elements.find((e) => e.id === dragStateRef.current!.elId)
      if (el && el.type === "rect" && (el.width < 0.5 || el.height < 0.5)) {
        deleteElement(el.id)
      } else {
        setTool("select")
      }
    }
    if (dragStateRef.current?.type === "wall") setTool("select")
    dragStateRef.current = null
  }

  const onSvgDoubleClick = () => {
    if (tool === "polygon" && polygonInProgress && polygonInProgress.length >= 3) {
      addPolygon(polygonInProgress)
      setPolygonInProgress(null)
      setTool("select")
    }
  }

  const onSvgWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * delta)))
  }

  // ── Element-level mouse handlers ─────────────────────────────
  const startMove = (e: ReactMouseEvent, el: FloorElement) => {
    if (tool !== "select") return
    e.stopPropagation()
    setSelectedId(el.id)
    const pt = screenToSvg(e.clientX, e.clientY)
    dragStateRef.current = {
      type: "move",
      elId: el.id,
      startSvg: pt,
      startEl: el,
    }
  }

  const startResizeRect = (e: ReactMouseEvent, el: FloorElement, handle: string) => {
    if (el.type !== "rect") return
    e.stopPropagation()
    setSelectedId(el.id)
    const pt = screenToSvg(e.clientX, e.clientY)
    dragStateRef.current = {
      type: "resize-rect",
      elId: el.id,
      handle,
      startSvg: pt,
      startEl: el,
    }
  }

  const startResizePoly = (e: ReactMouseEvent, el: FloorElement, vertexIndex: number) => {
    if (el.type !== "polygon") return
    e.stopPropagation()
    setSelectedId(el.id)
    dragStateRef.current = {
      type: "resize-poly",
      elId: el.id,
      vertexIndex,
      startEl: el,
    }
  }

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      await saveFloorLayout(floorId, JSON.stringify(layout))
      toast.success("План сохранён")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  // Горячие клавиши
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tagName = (e.target as HTMLElement).tagName
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault()
        undo()
        return
      }
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") ||
          ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")) {
        e.preventDefault()
        redo()
        return
      }

      // Copy/Paste
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedId) {
        e.preventDefault()
        copySelected()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault()
        pasteClipboard()
        return
      }

      // Удаление
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteElement(selectedId)
      }
      // Escape
      if (e.key === "Escape") {
        setSelectedId(null)
        setPolygonInProgress(null)
        setTool("select")
      }
      // Quick tools
      if (e.key === "v") setTool("select")
      else if (e.key === "r") setTool("rect")
      else if (e.key === "p") setTool("polygon")
      else if (e.key === "d") setTool("door")
      else if (e.key === "w" && !e.ctrlKey) setTool("wall")
      else if (e.key === "t") setTool("label")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layout, clipboard])

  const selected = layout.elements.find((e) => e.id === selectedId) ?? null
  const px = PX_PER_METER * zoom

  // ── Render ───────────────────────────────────────────────────
  const tools: { id: Tool; icon: React.ElementType; label: string }[] = [
    { id: "select", icon: MousePointer2, label: "Выбор (V)" },
    { id: "rect", icon: Square, label: "Прямоугольник (R)" },
    { id: "polygon", icon: Pentagon, label: "Многоугольник (P)" },
    { id: "door", icon: DoorOpen, label: "Дверь (D)" },
    { id: "window", icon: MoreHorizontal, label: "Окно" },
    { id: "wall", icon: Minus, label: "Стена/линия (W)" },
    { id: "label", icon: Type, label: "Подпись (T)" },
    { id: "stairs", icon: Sparkles, label: "Лестница" },
    { id: "elevator", icon: Square, label: "Лифт" },
    { id: "toilet", icon: Type, label: "Туалет (WC)" },
  ]

  return (
    <div className="flex gap-3 h-[calc(100vh-140px)]">
      {/* Toolbox */}
      <div className="w-14 shrink-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1.5 flex flex-col gap-1">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTool(t.id); setPolygonInProgress(null) }}
            title={t.label}
            className={`flex h-10 items-center justify-center rounded-lg transition ${
              tool === t.id ? "bg-blue-600 text-white" : "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
            }`}
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
        <div className="h-px bg-slate-200 my-1" />
        <button
          onClick={() => setShowGrid(!showGrid)}
          title="Сетка (G)"
          className={`flex h-10 items-center justify-center rounded-lg transition ${
            showGrid ? "bg-slate-200" : "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
          }`}
        >
          <GridIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.2))}
          title="Увеличить"
          className="flex h-10 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.2))}
          title="Уменьшить"
          className="flex h-10 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
          title="Сброс"
          className="flex h-10 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
        >
          <Move className="h-4 w-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">
            <span className="font-medium text-slate-700 dark:text-slate-300">{floorName}</span>
            {" · "}
            {tool === "rect" && "Растяните прямоугольник"}
            {tool === "polygon" && (polygonInProgress ? `Кликайте вершины (${polygonInProgress.length}). Двойной клик — завершить.` : "Кликайте вершины. Двойной клик — завершить")}
            {tool === "door" && "Кликните чтобы поставить дверь"}
            {tool === "wall" && "Растяните линию"}
            {tool === "label" && "Кликните чтобы добавить подпись"}
            {tool === "select" && "Shift+drag — панорама. Ctrl+wheel — зум. Del — удалить"}
          </p>
          <div className="flex items-center gap-1.5">
            {/* Режимы отображения */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setDisplayMode("full")}
                title="Полный вид"
                className={`px-2 py-1 rounded text-xs ${displayMode === "full" ? "bg-white dark:bg-slate-900 shadow-sm" : "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300"}`}
              >
                Полный
              </button>
              <button
                onClick={() => setDisplayMode("outline")}
                title="Только контур"
                className={`px-2 py-1 rounded text-xs ${displayMode === "outline" ? "bg-white dark:bg-slate-900 shadow-sm" : "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300"}`}
              >
                Контур
              </button>
              {layout.underlayUrl && (
                <button
                  onClick={() => setDisplayMode("underlay-only")}
                  title="Только подложка"
                  className={`px-2 py-1 rounded text-xs ${displayMode === "underlay-only" ? "bg-white dark:bg-slate-900 shadow-sm" : "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300"}`}
                >
                  Подложка
                </button>
              )}
            </div>

            <button
              onClick={() => setView3D(!view3D)}
              title="Изометрический 3D-вид"
              className={`p-2 rounded-lg ${view3D ? "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300" : "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"}`}
            >
              <Box className="h-4 w-4" />
            </button>

            <button
              onClick={() => setCalibration({ active: !calibration.active, first: null, second: null })}
              title="Калибровка масштаба (клик 2 точки)"
              className={`p-2 rounded-lg ${calibration.active ? "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300" : "text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"}`}
            >
              <Ruler className="h-4 w-4" />
            </button>

            <span className="w-px h-5 bg-slate-200 mx-1" />

            <button
              onClick={undo}
              disabled={history.length === 0}
              title="Отменить (Ctrl+Z)"
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={redo}
              disabled={future.length === 0}
              title="Повторить (Ctrl+Y)"
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              onClick={copySelected}
              disabled={!selectedId}
              title="Копировать (Ctrl+C)"
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Copy className="h-4 w-4" />
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">{Math.round(zoom * 100)}%</span>
            {f16Template && (
              <button
                onClick={() => {
                  if (layout.elements.length > 0) {
                    if (!window.confirm("Текущий план будет заменён шаблоном БЦ F16. Продолжить?")) return
                  }
                  setLayout(f16Template)
                  setSelectedId(null)
                  toast.success(`Шаблон этажа ${floorNumber} загружен — теперь сохраните`)
                }}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                title="Импорт готового плана этажа из отсканированных документов БЦ F16"
              >
                <Sparkles className="h-4 w-4" />
                Шаблон F16
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
          {/* Информер по калибровке */}
          {calibration.active && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-orange-100 dark:bg-orange-500/20 border border-orange-300 dark:border-orange-500/40 rounded-lg px-4 py-2 text-xs text-orange-800 dark:text-orange-200 shadow-lg">
              {!calibration.first
                ? "📍 Кликните по первой точке известного расстояния"
                : "📍 Теперь кликните по второй точке"}
              <button onClick={() => setCalibration({ active: false, first: null, second: null })}
                className="ml-3 text-orange-600 dark:text-orange-400 underline">Отмена</button>
            </div>
          )}

          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{
              cursor: calibration.active ? "crosshair" : tool === "select" ? "default" : "crosshair",
              transform: view3D ? "perspective(1500px) rotateX(55deg) rotateZ(-30deg)" : "none",
              transformOrigin: "center",
              transition: "transform 0.4s ease",
            }}
            onMouseDown={onSvgMouseDown}
            onMouseMove={onSvgMouseMove}
            onMouseUp={onSvgMouseUp}
            onMouseLeave={onSvgMouseUp}
            onDoubleClick={onSvgDoubleClick}
            onWheel={onSvgWheel}
          >
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {/* Background */}
              <rect
                x={0}
                y={0}
                width={layout.width * PX_PER_METER}
                height={layout.height * PX_PER_METER}
                fill="white"
                stroke="#cbd5e1"
                strokeWidth={2 / zoom}
              />
              {/* Underlay image */}
              {layout.underlayUrl && (
                <image
                  href={layout.underlayUrl}
                  x={0}
                  y={0}
                  width={layout.width * PX_PER_METER}
                  height={layout.height * PX_PER_METER}
                  opacity={underlayOpacity}
                  preserveAspectRatio="xMidYMid meet"
                />
              )}
              {/* Grid */}
              {showGrid && (
                <g opacity={0.4}>
                  {Array.from({ length: Math.floor(layout.width) + 1 }, (_, i) => (
                    <line
                      key={`gx-${i}`}
                      x1={i * PX_PER_METER}
                      y1={0}
                      x2={i * PX_PER_METER}
                      y2={layout.height * PX_PER_METER}
                      stroke="#e2e8f0"
                      strokeWidth={1 / zoom}
                    />
                  ))}
                  {Array.from({ length: Math.floor(layout.height) + 1 }, (_, i) => (
                    <line
                      key={`gy-${i}`}
                      x1={0}
                      y1={i * PX_PER_METER}
                      x2={layout.width * PX_PER_METER}
                      y2={i * PX_PER_METER}
                      stroke="#e2e8f0"
                      strokeWidth={1 / zoom}
                    />
                  ))}
                </g>
              )}

              {/* Elements */}
              {displayMode !== "underlay-only" && layout.elements.map((el) => (
                <RenderElement
                  key={el.id}
                  el={el}
                  selected={el.id === selectedId}
                  zoom={zoom}
                  spaces={spaces}
                  outlineOnly={displayMode === "outline"}
                  onMouseDown={(e) => startMove(e, el)}
                  onResizeRect={(e, h) => startResizeRect(e, el, h)}
                  onResizePoly={(e, vi) => startResizePoly(e, el, vi)}
                />
              ))}

              {/* Calibration markers */}
              {calibration.first && (
                <circle cx={calibration.first.x * PX_PER_METER} cy={calibration.first.y * PX_PER_METER}
                  r={8 / zoom} fill="#fb923c" stroke="white" strokeWidth={2 / zoom} />
              )}
              {calibration.second && (
                <circle cx={calibration.second.x * PX_PER_METER} cy={calibration.second.y * PX_PER_METER}
                  r={8 / zoom} fill="#fb923c" stroke="white" strokeWidth={2 / zoom} />
              )}
              {calibration.first && calibration.second && (
                <line
                  x1={calibration.first.x * PX_PER_METER} y1={calibration.first.y * PX_PER_METER}
                  x2={calibration.second.x * PX_PER_METER} y2={calibration.second.y * PX_PER_METER}
                  stroke="#fb923c" strokeWidth={2 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} />
              )}

              {/* Polygon in progress preview */}
              {polygonInProgress && polygonInProgress.length > 0 && (
                <g>
                  <polyline
                    points={polygonInProgress.map((p) => `${p.x * PX_PER_METER},${p.y * PX_PER_METER}`).join(" ")}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2 / zoom}
                    strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                  />
                  {polygonInProgress.map((p, i) => (
                    <circle key={i} cx={p.x * PX_PER_METER} cy={p.y * PX_PER_METER} r={4 / zoom} fill="#3b82f6" />
                  ))}
                </g>
              )}
            </g>
          </svg>

          {/* Scale indicator */}
          <div className="absolute bottom-3 right-3 bg-white dark:bg-slate-900/90 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500 flex items-center gap-2">
            <div style={{ width: px, height: 6, background: "linear-gradient(to right, black 50%, white 50%)", border: "1px solid black" }} />
            1 метр
          </div>
        </div>
      </div>

      {/* Properties */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        {/* Underlay image */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            Подложка (фото плана)
          </p>
          {layout.underlayUrl ? (
            <>
              <div className="relative aspect-video rounded border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={layout.underlayUrl} alt="План" className="w-full h-full object-contain" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Прозрачность: {Math.round(underlayOpacity * 100)}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={underlayOpacity * 100}
                  onChange={(e) => setUnderlayOpacity(parseInt(e.target.value) / 100)}
                  className="w-full"
                />
              </div>
              <button
                onClick={() => setLayout((p) => ({ ...p, underlayUrl: null }))}
                className="flex items-center gap-1 text-xs text-red-500 hover:underline"
              >
                <XIcon className="h-3 w-3" /> Удалить подложку
              </button>
            </>
          ) : (
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1.5">URL картинки</label>
              <input
                type="url"
                placeholder="https://... или загрузите файл"
                onChange={(e) => {
                  const url = e.target.value.trim()
                  if (url) setLayout((p) => ({ ...p, underlayUrl: url }))
                }}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-xs"
              />
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Загрузите PNG/JPG плана здания в Google Drive / Dropbox и вставьте прямую ссылку на изображение</p>
              <label className="block mt-2 text-xs cursor-pointer">
                <span className="block text-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 py-1.5">📎 Или выберите файл (base64)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.size > 1024 * 1024) {
                      toast.error("Файл слишком большой, макс 1 МБ")
                      return
                    }
                    const reader = new FileReader()
                    reader.onload = () => {
                      const dataUrl = reader.result as string
                      setLayout((p) => ({ ...p, underlayUrl: dataUrl }))
                      toast.success("Подложка загружена")
                    }
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Canvas size */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">Размеры этажа</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Ширина (м)</label>
              <input
                type="number"
                min="5"
                max="200"
                step="0.5"
                value={layout.width}
                onChange={(e) => setLayout((p) => ({ ...p, width: parseFloat(e.target.value) || 30 }))}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Высота (м)</label>
              <input
                type="number"
                min="5"
                max="200"
                step="0.5"
                value={layout.height}
                onChange={(e) => setLayout((p) => ({ ...p, height: parseFloat(e.target.value) || 20 }))}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Selected element properties */}
        {selected ? (
          <PropertiesPanel
            element={selected}
            spaces={spaces}
            onUpdate={(patch) => updateElement(selected.id, patch)}
            onDelete={() => deleteElement(selected.id)}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Выделите элемент</p>
            <p>Кликните по элементу на плане чтобы редактировать его свойства.</p>
            <div className="mt-3 space-y-1 text-slate-500 dark:text-slate-400 dark:text-slate-500">
              <p><kbd className="bg-slate-100 dark:bg-slate-800 px-1 rounded">V</kbd> — выбор</p>
              <p><kbd className="bg-slate-100 dark:bg-slate-800 px-1 rounded">R</kbd> — прямоугольник</p>
              <p><kbd className="bg-slate-100 dark:bg-slate-800 px-1 rounded">P</kbd> — многоугольник</p>
              <p><kbd className="bg-slate-100 dark:bg-slate-800 px-1 rounded">D</kbd> — дверь</p>
              <p><kbd className="bg-slate-100 dark:bg-slate-800 px-1 rounded">Esc</kbd> — отменить</p>
              <p><kbd className="bg-slate-100 dark:bg-slate-800 px-1 rounded">Del</kbd> — удалить выделенное</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Render single element ──────────────────────────────────────
function RenderElement({
  el, selected, zoom, spaces, outlineOnly,
  onMouseDown, onResizeRect, onResizePoly,
}: {
  el: FloorElement
  selected: boolean
  zoom: number
  spaces: SpaceLite[]
  outlineOnly?: boolean
  onMouseDown: (e: ReactMouseEvent) => void
  onResizeRect: (e: ReactMouseEvent, handle: string) => void
  onResizePoly: (e: ReactMouseEvent, vertexIndex: number) => void
}) {
  const linkedSpace = "spaceId" in el && el.spaceId
    ? spaces.find((s) => s.id === el.spaceId)
    : undefined
  const status = linkedSpace?.status ?? "UNLINKED"
  const fill = outlineOnly ? "transparent" : (STATUS_FILL[status] ?? STATUS_FILL.UNLINKED)
  const stroke = selected ? "#3b82f6" : (STATUS_STROKE[status] ?? STATUS_STROKE.UNLINKED)
  const strokeWidth = selected ? 3 / zoom : 1.5 / zoom

  if (el.type === "rect") {
    const center = elementCenter(el)
    const handles = [
      { id: "nw", x: el.x, y: el.y, cursor: "nwse-resize" },
      { id: "ne", x: el.x + el.width, y: el.y, cursor: "nesw-resize" },
      { id: "se", x: el.x + el.width, y: el.y + el.height, cursor: "nwse-resize" },
      { id: "sw", x: el.x, y: el.y + el.height, cursor: "nesw-resize" },
    ]
    return (
      <g onMouseDown={onMouseDown} style={{ cursor: "move" }}>
        <rect
          x={el.x * PX_PER_METER}
          y={el.y * PX_PER_METER}
          width={el.width * PX_PER_METER}
          height={el.height * PX_PER_METER}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <text
          x={center.x * PX_PER_METER}
          y={center.y * PX_PER_METER}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={14 / zoom}
          fill="#0f172a"
          fontWeight={600}
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {linkedSpace ? `Каб. ${linkedSpace.number}` : (el.label || "")}
        </text>
        <text
          x={center.x * PX_PER_METER}
          y={center.y * PX_PER_METER + 16 / zoom}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={10 / zoom}
          fill="#64748b"
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {(el.width * el.height).toFixed(1)} м² · {el.width.toFixed(1)}×{el.height.toFixed(1)}
        </text>

        {selected && handles.map((h) => (
          <rect
            key={h.id}
            x={h.x * PX_PER_METER - 5 / zoom}
            y={h.y * PX_PER_METER - 5 / zoom}
            width={10 / zoom}
            height={10 / zoom}
            fill="white"
            stroke="#3b82f6"
            strokeWidth={1.5 / zoom}
            style={{ cursor: h.cursor }}
            onMouseDown={(e) => onResizeRect(e, h.id)}
          />
        ))}
      </g>
    )
  }

  if (el.type === "polygon") {
    const center = elementCenter(el)
    const points = el.points.map((p) => `${p.x * PX_PER_METER},${p.y * PX_PER_METER}`).join(" ")
    const area = polygonArea(el.points)
    return (
      <g onMouseDown={onMouseDown} style={{ cursor: "move" }}>
        <polygon
          points={points}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <text
          x={center.x * PX_PER_METER}
          y={center.y * PX_PER_METER}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={14 / zoom}
          fill="#0f172a"
          fontWeight={600}
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {linkedSpace ? `Каб. ${linkedSpace.number}` : (el.label || "")}
        </text>
        <text
          x={center.x * PX_PER_METER}
          y={center.y * PX_PER_METER + 16 / zoom}
          textAnchor="middle"
          fontSize={10 / zoom}
          fill="#64748b"
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {area.toFixed(1)} м²
        </text>

        {selected && el.points.map((p, i) => (
          <circle
            key={i}
            cx={p.x * PX_PER_METER}
            cy={p.y * PX_PER_METER}
            r={6 / zoom}
            fill="white"
            stroke="#3b82f6"
            strokeWidth={1.5 / zoom}
            style={{ cursor: "move" }}
            onMouseDown={(e) => onResizePoly(e, i)}
          />
        ))}
      </g>
    )
  }

  if (el.type === "door") {
    const cx = el.x * PX_PER_METER
    const cy = el.y * PX_PER_METER
    const w = el.width * PX_PER_METER
    return (
      <g onMouseDown={onMouseDown} transform={`rotate(${el.rotation} ${cx} ${cy})`} style={{ cursor: "move" }}>
        {/* Door slab */}
        <line x1={cx - w / 2} y1={cy} x2={cx + w / 2} y2={cy} stroke="#475569" strokeWidth={3 / zoom} />
        {/* Hinge arc */}
        <path
          d={el.swing === "right"
            ? `M ${cx + w / 2} ${cy} A ${w} ${w} 0 0 0 ${cx + w / 2 - w} ${cy + w}`
            : `M ${cx - w / 2} ${cy} A ${w} ${w} 0 0 1 ${cx - w / 2 + w} ${cy + w}`}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1 / zoom}
          strokeDasharray={`${3 / zoom} ${3 / zoom}`}
        />
        {selected && (
          <rect
            x={cx - w / 2 - 4 / zoom}
            y={cy - 4 / zoom}
            width={w + 8 / zoom}
            height={8 / zoom}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1.5 / zoom}
            strokeDasharray={`${2 / zoom} ${2 / zoom}`}
          />
        )}
      </g>
    )
  }

  if (el.type === "label") {
    const fontSize = (el.fontSize ?? 0.5) * PX_PER_METER
    return (
      <g onMouseDown={onMouseDown} style={{ cursor: "move" }}>
        <text
          x={el.x * PX_PER_METER}
          y={el.y * PX_PER_METER}
          fontSize={fontSize}
          fill={selected ? "#3b82f6" : "#475569"}
          fontWeight={500}
          style={{ userSelect: "none" }}
        >
          {el.text}
        </text>
      </g>
    )
  }

  if (el.type === "wall") {
    const thickness = (el.thickness ?? 0.15) * PX_PER_METER
    return (
      <g onMouseDown={onMouseDown} style={{ cursor: "move" }}>
        <line
          x1={el.x1 * PX_PER_METER}
          y1={el.y1 * PX_PER_METER}
          x2={el.x2 * PX_PER_METER}
          y2={el.y2 * PX_PER_METER}
          stroke={selected ? "#3b82f6" : "#475569"}
          strokeWidth={thickness}
          strokeLinecap="round"
        />
      </g>
    )
  }

  if (el.type === "window") {
    const cx = el.x * PX_PER_METER
    const cy = el.y * PX_PER_METER
    const w = el.width * PX_PER_METER
    return (
      <g onMouseDown={onMouseDown} transform={`rotate(${el.rotation} ${cx} ${cy})`} style={{ cursor: "move" }}>
        <rect
          x={cx - w / 2}
          y={cy - 3 / zoom}
          width={w}
          height={6 / zoom}
          fill="#dbeafe"
          stroke={selected ? "#3b82f6" : "#60a5fa"}
          strokeWidth={1.5 / zoom}
        />
        <line
          x1={cx - w / 2}
          y1={cy}
          x2={cx + w / 2}
          y2={cy}
          stroke={selected ? "#3b82f6" : "#3b82f6"}
          strokeWidth={1 / zoom}
        />
      </g>
    )
  }

  if (el.type === "icon") {
    const s = el.size * PX_PER_METER
    const x = el.x * PX_PER_METER
    const y = el.y * PX_PER_METER
    const colors: Record<string, { bg: string; border: string; fg: string }> = {
      stairs: { bg: "#fef3c7", border: "#f59e0b", fg: "#92400e" },
      elevator: { bg: "#ede9fe", border: "#8b5cf6", fg: "#5b21b6" },
      toilet: { bg: "#dbeafe", border: "#3b82f6", fg: "#1e40af" },
      kitchen: { bg: "#dcfce7", border: "#10b981", fg: "#065f46" },
      parking: { bg: "#f1f5f9", border: "#64748b", fg: "#334155" },
    }
    const c = colors[el.kind] ?? colors.parking
    const symbol: Record<string, string> = {
      stairs: "≡", elevator: "▲▼", toilet: "WC", kitchen: "🍳", parking: "P",
    }
    return (
      <g onMouseDown={onMouseDown} style={{ cursor: "move" }}>
        <rect
          x={x - s / 2}
          y={y - s / 2}
          width={s}
          height={s}
          fill={c.bg}
          stroke={selected ? "#3b82f6" : c.border}
          strokeWidth={(selected ? 2 : 1.5) / zoom}
          rx={4 / zoom}
        />
        <text
          x={x}
          y={y - 4 / zoom}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.min(s * 0.4, 24 / zoom)}
          fontWeight="bold"
          fill={c.fg}
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {symbol[el.kind] ?? el.kind}
        </text>
        {el.label && (
          <text
            x={x}
            y={y + s / 2 - 4 / zoom}
            textAnchor="middle"
            fontSize={10 / zoom}
            fill={c.fg}
            pointerEvents="none"
            style={{ userSelect: "none" }}
          >
            {el.label}
          </text>
        )}
      </g>
    )
  }

  return null
}

// ── Properties Panel ───────────────────────────────────────────
function PropertiesPanel({
  element, spaces, onUpdate, onDelete,
}: {
  element: FloorElement
  spaces: SpaceLite[]
  onUpdate: (patch: Partial<FloorElement>) => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">
          {element.type === "rect" ? "Прямоугольник"
            : element.type === "polygon" ? "Многоугольник"
            : element.type === "door" ? "Дверь"
            : element.type === "window" ? "Окно"
            : element.type === "label" ? "Подпись"
            : element.type === "icon" ? `Иконка: ${element.kind}`
            : "Стена"}
        </p>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 dark:text-red-400">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {(element.type === "rect" || element.type === "polygon") && (
        <>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Связать с помещением</label>
            <select
              value={element.spaceId ?? ""}
              onChange={(e) => onUpdate({ spaceId: e.target.value || null } as Partial<FloorElement>)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
            >
              <option value="">— Не связано —</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>Каб. {s.number} ({s.status})</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Цвет фигуры берётся из статуса помещения</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Подпись (если не связано)</label>
            <input
              value={element.label ?? ""}
              onChange={(e) => onUpdate({ label: e.target.value } as Partial<FloorElement>)}
              placeholder="Холл / Коридор / ..."
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
        </>
      )}

      {element.type === "rect" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="X (м)" value={element.x} onChange={(v) => onUpdate({ x: v } as Partial<FloorElement>)} />
          <Field label="Y (м)" value={element.y} onChange={(v) => onUpdate({ y: v } as Partial<FloorElement>)} />
          <Field label="Ширина (м)" value={element.width} onChange={(v) => onUpdate({ width: Math.max(0.1, v) } as Partial<FloorElement>)} />
          <Field label="Длина (м)" value={element.height} onChange={(v) => onUpdate({ height: Math.max(0.1, v) } as Partial<FloorElement>)} />
          <div className="col-span-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded px-2 py-1.5">
            Площадь: <b>{(element.width * element.height).toFixed(2)} м²</b>
          </div>
        </div>
      )}

      {element.type === "polygon" && (
        <div className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded px-2 py-1.5">
          Вершин: {element.points.length} · Площадь: <b>{polygonArea(element.points).toFixed(2)} м²</b>
        </div>
      )}

      {element.type === "door" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X (м)" value={element.x} onChange={(v) => onUpdate({ x: v } as Partial<FloorElement>)} />
            <Field label="Y (м)" value={element.y} onChange={(v) => onUpdate({ y: v } as Partial<FloorElement>)} />
            <Field label="Ширина (м)" value={element.width} onChange={(v) => onUpdate({ width: Math.max(0.4, v) } as Partial<FloorElement>)} step={0.1} />
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Поворот</label>
              <select
                value={element.rotation}
                onChange={(e) => onUpdate({ rotation: parseInt(e.target.value) } as Partial<FloorElement>)}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
              >
                <option value={0}>0°</option>
                <option value={90}>90°</option>
                <option value={180}>180°</option>
                <option value={270}>270°</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Сторона петель</label>
            <div className="flex gap-2">
              <button
                onClick={() => onUpdate({ swing: "left" } as Partial<FloorElement>)}
                className={`flex-1 rounded border px-3 py-1.5 text-xs ${element.swing === "left" ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300" : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500"}`}
              >
                Слева
              </button>
              <button
                onClick={() => onUpdate({ swing: "right" } as Partial<FloorElement>)}
                className={`flex-1 rounded border px-3 py-1.5 text-xs ${element.swing === "right" ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300" : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500"}`}
              >
                Справа
              </button>
            </div>
          </div>
        </>
      )}

      {element.type === "label" && (
        <>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Текст</label>
            <input
              value={element.text}
              onChange={(e) => onUpdate({ text: e.target.value } as Partial<FloorElement>)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Размер (м)</label>
            <input
              type="number"
              min="0.2"
              max="2"
              step="0.1"
              value={element.fontSize ?? 0.5}
              onChange={(e) => onUpdate({ fontSize: parseFloat(e.target.value) } as Partial<FloorElement>)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
        </>
      )}

      {element.type === "wall" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X1 (м)" value={element.x1} onChange={(v) => onUpdate({ x1: v } as Partial<FloorElement>)} />
            <Field label="Y1 (м)" value={element.y1} onChange={(v) => onUpdate({ y1: v } as Partial<FloorElement>)} />
            <Field label="X2 (м)" value={element.x2} onChange={(v) => onUpdate({ x2: v } as Partial<FloorElement>)} />
            <Field label="Y2 (м)" value={element.y2} onChange={(v) => onUpdate({ y2: v } as Partial<FloorElement>)} />
          </div>
          <Field label="Толщина (м)" value={element.thickness ?? 0.15} step={0.05} onChange={(v) => onUpdate({ thickness: Math.max(0.05, v) } as Partial<FloorElement>)} />
        </>
      )}

      {element.type === "window" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X (м)" value={element.x} onChange={(v) => onUpdate({ x: v } as Partial<FloorElement>)} />
            <Field label="Y (м)" value={element.y} onChange={(v) => onUpdate({ y: v } as Partial<FloorElement>)} />
            <Field label="Ширина (м)" value={element.width} step={0.1} onChange={(v) => onUpdate({ width: Math.max(0.3, v) } as Partial<FloorElement>)} />
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Поворот</label>
              <select
                value={element.rotation}
                onChange={(e) => onUpdate({ rotation: parseInt(e.target.value) } as Partial<FloorElement>)}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
              >
                <option value={0}>0°</option>
                <option value={90}>90°</option>
                <option value={180}>180°</option>
                <option value={270}>270°</option>
              </select>
            </div>
          </div>
        </>
      )}

      {element.type === "icon" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X (м)" value={element.x} onChange={(v) => onUpdate({ x: v } as Partial<FloorElement>)} />
            <Field label="Y (м)" value={element.y} onChange={(v) => onUpdate({ y: v } as Partial<FloorElement>)} />
            <Field label="Размер (м)" value={element.size} step={0.1} onChange={(v) => onUpdate({ size: Math.max(0.5, v) } as Partial<FloorElement>)} />
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Тип</label>
              <select
                value={element.kind}
                onChange={(e) => onUpdate({ kind: e.target.value } as Partial<FloorElement>)}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
              >
                <option value="stairs">Лестница</option>
                <option value="elevator">Лифт</option>
                <option value="toilet">Туалет</option>
                <option value="kitchen">Кухня</option>
                <option value="parking">Парковка</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Подпись</label>
            <input
              value={element.label ?? ""}
              onChange={(e) => onUpdate({ label: e.target.value } as Partial<FloorElement>)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
        </>
      )}
    </div>
  )
}

function scaleElement(el: FloorElement, k: number): FloorElement {
  if (el.type === "rect") return { ...el, x: el.x * k, y: el.y * k, width: el.width * k, height: el.height * k }
  if (el.type === "polygon") return { ...el, points: el.points.map((p) => ({ x: p.x * k, y: p.y * k })) }
  if (el.type === "door") return { ...el, x: el.x * k, y: el.y * k, width: el.width * k }
  if (el.type === "window") return { ...el, x: el.x * k, y: el.y * k, width: el.width * k }
  if (el.type === "label") return { ...el, x: el.x * k, y: el.y * k, fontSize: (el.fontSize ?? 0.5) * k }
  if (el.type === "wall") return { ...el, x1: el.x1 * k, y1: el.y1 * k, x2: el.x2 * k, y2: el.y2 * k, thickness: (el.thickness ?? 0.15) * k }
  if (el.type === "icon") return { ...el, x: el.x * k, y: el.y * k, size: el.size * k }
  return el
}

function Field({ label, value, onChange, step = 0.5 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
      />
    </div>
  )
}
