"use client"

import { useState, useRef, useEffect, useCallback, useMemo, MouseEvent as ReactMouseEvent } from "react"
import dynamic from "next/dynamic"
import { saveFloorLayout, setBuildingAreaFromFloors } from "@/app/actions/floor-layout"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Save, Square, Pentagon, DoorOpen, Type, Minus,
  MousePointer2, ZoomIn, ZoomOut, Grid as GridIcon, Sparkles,
  Undo2, Redo2, Copy, MoreHorizontal,
  Ruler, Box, Maximize2, Eraser, RotateCw, LayoutTemplate as TemplateIcon,
} from "lucide-react"
import {
  type FloorLayoutV2,
  type FloorElement,
  type Point,
  type RoomKind,
  DEFAULT_LAYOUT,
  uid,
  rotateLayout90,
} from "@/lib/floor-layout"
import { RenderElement, type FloorEditorSpaceLite as SpaceLite } from "./floor-render-element"
import {
  PanelSkeleton, UnderlayPanel, findNearestVertex, rotateImage90, scaleElement, snap, useDebounced,
} from "./floor-editor-utils"
import type { SpaceInfo as Floor3DSpaceInfo } from "@/components/floor/floor-view"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

type Tool = "select" | "rect" | "polygon" | "door" | "window" | "label" | "wall" | "stairs" | "elevator" | "toilet"

// Живое 3D в сплит-экране: three.js тяжёлый — только в браузере и только при включении
const Floor3DPanel = dynamic(() => import("@/components/floor/floor-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-slate-400">Загрузка 3D…</div>
  ),
})

const InsertRoomPanel = dynamic(() => import("./floor-editor-panels").then((mod) => mod.InsertRoomPanel), {
  loading: () => <PanelSkeleton />,
})
const AreasPanel = dynamic(() => import("./floor-editor-panels").then((mod) => mod.AreasPanel), {
  loading: () => <PanelSkeleton />,
})
const DangerZone = dynamic(() => import("./floor-editor-danger-zone").then((mod) => mod.DangerZone), {
  loading: () => <PanelSkeleton tone="danger" />,
})
const PropertiesPanel = dynamic(() => import("./floor-editor-panels").then((mod) => mod.PropertiesPanel), {
  loading: () => <PanelSkeleton />,
})
const TemplateGallery = dynamic(() => import("./template-gallery").then((mod) => mod.TemplateGallery), { ssr: false })
const AiLayoutButton = dynamic(() => import("./floor-editor-panels").then((mod) => mod.AiLayoutButton), { ssr: false })
const FloorHints = dynamic(() => import("./floor-editor-panels").then((mod) => mod.FloorHints), { ssr: false })

const PX_PER_METER = 40 // базовый масштаб
const MIN_ZOOM = 0.3
const MAX_ZOOM = 4

export function FloorEditor({
  floorId,
  floorName,
  floorNumber,
  floorKind,
  f16Template,
  initialLayout,
  initialTotalArea,
  spaces,
  buildingFootprint,
}: {
  floorId: string
  floorName: string
  floorNumber: number
  floorKind?: string
  f16Template?: FloorLayoutV2 | null
  initialLayout: FloorLayoutV2 | null
  initialTotalArea?: number | null
  spaces: SpaceLite[]
  /** Габариты здания (м) — опорный контур в редакторе территории. */
  buildingFootprint?: { width: number; depth: number; name: string } | null
}) {
  const router = useRouter()
  const [layout, setLayoutRaw] = useState<FloorLayoutV2>(() => initialLayout ?? DEFAULT_LAYOUT)
  const [totalArea, setTotalArea] = useState<number | null>(initialTotalArea ?? null)
  const [history, setHistory] = useState<FloorLayoutV2[]>([])
  const [future, setFuture] = useState<FloorLayoutV2[]>([])
  const isRestoringRef = useRef(false)
  const layoutRef = useRef(layout)
  const dragHistoryCapturedRef = useRef(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [tool, setTool] = useState<Tool>("select")
  // Тип следующей фигуры (rect/polygon, нарисованных через тулбокс).
  // Для прямоугольника-через-перетягивание и многоугольника — это применяется при создании.
  const [drawKind, setDrawKind] = useState<RoomKind>("rentable")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clipboard, setClipboardRaw] = useState<FloorElement | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [polygonInProgress, setPolygonInProgress] = useState<Point[] | null>(null)
  // Точка магнита (показывается жёлтым кружком когда курсор близко к концу стены/угла)
  const [snapTarget, setSnapTarget] = useState<Point | null>(null)
  const [saving, setSaving] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [underlayOpacity, setUnderlayOpacity] = useState(0.5)
  const [displayMode, setDisplayMode] = useState<"full" | "outline" | "underlay-only">("full")
  const [view3D, setView3D] = useState(false)
  const [calibration, setCalibration] = useState<{ active: boolean; first: Point | null; second: Point | null }>({
    active: false, first: null, second: null,
  })

  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

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

  const setLayoutDraft = useCallback((next: FloorLayoutV2 | ((prev: FloorLayoutV2) => FloorLayoutV2)) => {
    setLayoutRaw(next)
  }, [])

  // ── Живое 3D (сплит-экран): дебаунс плана + перенос данных помещений ──
  const layout3d = useDebounced(layout, 300)
  const spaces3d = useMemo<Floor3DSpaceInfo[]>(
    () => spaces.map((s) => ({
      id: s.id,
      number: s.number,
      area: s.area ?? 0,
      status: s.status,
      description: null,
      tenant: null,
    })),
    [spaces],
  )
  // Перетаскивание комнаты/иконки прямо в 3D — сдвиг элемента с записью в историю
  const moveElementBy = useCallback((id: string, dx: number, dy: number) => {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((el): FloorElement => {
        if (el.id !== id) return el
        switch (el.type) {
          case "rect":
            return { ...el, x: el.x + dx, y: el.y + dy }
          case "polygon":
            return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
          case "wall":
            return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy }
          case "door":
          case "window":
          case "icon":
          case "label":
            return { ...el, x: el.x + dx, y: el.y + dy }
        }
      }),
    }))
  }, [setLayout])

  const rememberLayoutForDrag = useCallback(() => {
    if (dragHistoryCapturedRef.current) return
    dragHistoryCapturedRef.current = true
    const snapshot = layoutRef.current
    setHistory((h) => [...h.slice(-49), snapshot])
    setFuture([])
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
  const addRect = (x: number, y: number, w = 4, h = 3, label = "", kind: RoomKind = "rentable"): string => {
    const id = uid()
    setLayout((prev) => ({
      ...prev,
      elements: [
        ...prev.elements,
        { type: "rect", id, x: snap(x), y: snap(y), width: snap(w), height: snap(h), label, kind } as FloorElement,
      ],
    }))
    return id
  }

  // Подобрать свободную позицию для новой комнаты w×h
  const findFreeSpot = useCallback((w: number, h: number): Point => {
    const margin = 0.5
    const step = 0.5
    const maxX = Math.max(0, layout.width - w - margin)
    const maxY = Math.max(0, layout.height - h - margin)
    const occupied: { x: number; y: number; w: number; h: number }[] = []
    for (const el of layout.elements) {
      if (el.type === "rect") occupied.push({ x: el.x, y: el.y, w: el.width, h: el.height })
    }
    const overlaps = (x: number, y: number) =>
      occupied.some((o) => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y)
    for (let y = margin; y <= maxY; y += step) {
      for (let x = margin; x <= maxX; x += step) {
        if (!overlaps(x, y)) return { x, y }
      }
    }
    return { x: margin, y: margin }
  }, [layout])

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

  const addPolygon = (points: Point[], kind: RoomKind = "rentable"): string | null => {
    if (points.length < 3) return null
    const id = uid()
    setLayout((prev) => ({
      ...prev,
      elements: [
        ...prev.elements,
        { type: "polygon", id, kind, points: points.map((p) => ({ x: snap(p.x), y: snap(p.y) })), label: "" } as FloorElement,
      ],
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

  const updateElementDraft = (id: string, patch: Partial<FloorElement>) => {
    setLayoutDraft((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? ({ ...el, ...patch } as FloorElement) : el)),
    }))
  }

  const deleteElement = (id: string) => {
    setLayout((prev) => ({ ...prev, elements: prev.elements.filter((e) => e.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  // ── Поворот всего плана на 90° (вертикальный ↔ горизонтальный) ──
  // Элементы поворачиваются координатно (rotateLayout90), подложка — как
  // картинка через canvas, чтобы после сохранения всё осталось согласованным.
  const rotatePlan = async () => {
    let rotatedUnderlay = layout.underlayUrl ?? null
    if (layout.underlayUrl) {
      try {
        rotatedUnderlay = await rotateImage90(layout.underlayUrl)
      } catch (e) {
        console.warn("[floor-editor] не удалось повернуть подложку:", e)
        toast.error("Подложку повернуть не удалось (внешняя картинка?) — повернулись только элементы")
      }
    }
    setLayout((prev) => ({ ...rotateLayout90(prev), underlayUrl: rotatedUnderlay }))
    toast.success("План повёрнут на 90° — не забудьте сохранить")
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
      const id = addRect(pt.x, pt.y, 0.5, 0.5, "", drawKind)
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
      // Инструмент остаётся выбранным — можно ставить ещё двери. Esc или V → select.
      return
    }

    if (tool === "window") {
      addWindow(pt.x, pt.y)
      return
    }

    if (tool === "stairs" || tool === "elevator" || tool === "toilet") {
      addIcon(pt.x, pt.y, tool)
      return
    }

    if (tool === "label") {
      const text = window.prompt("Текст подписи:", "Подпись") ?? ""
      if (text.trim()) addLabel(pt.x, pt.y, text)
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
      // Click — добавить вершину; если близко к существующей точке — магнитим
      const snapPoint = findNearestVertex(layout, pt)
      const vertex = snapPoint ?? { x: snap(pt.x), y: snap(pt.y) }
      setPolygonInProgress((prev) => (prev ? [...prev, vertex] : [vertex]))
      setSnapTarget(null)
      return
    }

    // tool === "select" — клик по пустому месту снимает выделение
    setSelectedId(null)
  }

  const onSvgMouseMove = (e: ReactMouseEvent) => {
    const ds = dragStateRef.current
    // Hover-магнит: показываем точку магнита когда в polygon-режиме без drag
    if (!ds && tool === "polygon") {
      const pt = screenToSvg(e.clientX, e.clientY)
      setSnapTarget(findNearestVertex(layout, pt))
    } else if (!ds && snapTarget) {
      setSnapTarget(null)
    }
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
      updateElementDraft(ds.elId, { x: snap(x), y: snap(y), width: snap(w), height: snap(h) } as Partial<FloorElement>)
      return
    }

    if (ds.type === "wall" && ds.elId && ds.startSvg) {
      // Магнит: если конец стены близко к существующей точке (стены/угла) — притягиваем
      const snapPoint = findNearestVertex(layout, pt, ds.elId)
      const endX = snapPoint ? snapPoint.x : snap(pt.x)
      const endY = snapPoint ? snapPoint.y : snap(pt.y)
      setSnapTarget(snapPoint)
      updateElementDraft(ds.elId, { x2: endX, y2: endY } as Partial<FloorElement>)
      return
    }

    if (ds.type === "move" && ds.elId && ds.startEl && ds.startSvg) {
      rememberLayoutForDrag()
      const dx = pt.x - ds.startSvg.x
      const dy = pt.y - ds.startSvg.y
      const startEl = ds.startEl
      if (startEl.type === "rect" || startEl.type === "door" || startEl.type === "window" || startEl.type === "label" || startEl.type === "icon") {
        updateElementDraft(ds.elId, { x: snap(startEl.x + dx), y: snap(startEl.y + dy) } as Partial<FloorElement>)
      } else if (startEl.type === "polygon") {
        updateElementDraft(ds.elId, {
          points: startEl.points.map((p) => ({ x: snap(p.x + dx), y: snap(p.y + dy) })),
        } as Partial<FloorElement>)
      } else if (startEl.type === "wall") {
        updateElementDraft(ds.elId, {
          x1: snap(startEl.x1 + dx),
          y1: snap(startEl.y1 + dy),
          x2: snap(startEl.x2 + dx),
          y2: snap(startEl.y2 + dy),
        } as Partial<FloorElement>)
      }
      return
    }

    if (ds.type === "resize-rect" && ds.elId && ds.startEl && ds.handle && ds.startSvg) {
      rememberLayoutForDrag()
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
      updateElementDraft(ds.elId, { x: snap(x), y: snap(y), width: snap(width), height: snap(height) } as Partial<FloorElement>)
      return
    }

    if (ds.type === "resize-poly" && ds.elId && ds.startEl && ds.vertexIndex !== undefined) {
      rememberLayoutForDrag()
      const start = ds.startEl
      if (start.type !== "polygon") return
      const newPoints = start.points.map((p, i) =>
        i === ds.vertexIndex ? { x: snap(pt.x), y: snap(pt.y) } : p
      )
      updateElementDraft(ds.elId, { points: newPoints } as Partial<FloorElement>)
    }
  }

  const onSvgMouseUp = () => {
    if (dragStateRef.current?.type === "draw-rect" && dragStateRef.current.elId) {
      // Если получился крошечный — удалим
      const el = layout.elements.find((e) => e.id === dragStateRef.current!.elId)
      if (el && el.type === "rect" && (el.width < 0.5 || el.height < 0.5)) {
        deleteElement(el.id)
      }
      // Инструмент остаётся, можно рисовать ещё прямоугольники
    }
    // wall, draw-rect: тоже не сбрасываем — рисуем ещё одну стену/прямоугольник
    dragStateRef.current = null
    dragHistoryCapturedRef.current = false
    setSnapTarget(null)
  }

  const onSvgDoubleClick = () => {
    if (tool === "polygon" && polygonInProgress && polygonInProgress.length >= 3) {
      addPolygon(polygonInProgress, drawKind)
      setPolygonInProgress(null)
      // Инструмент polygon остаётся — можно рисовать следующий контур
    }
  }

  const onSvgWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * delta)))
  }

  // ── Element-level mouse handlers ─────────────────────────────
  const startMove = useCallback((e: ReactMouseEvent, el: FloorElement) => {
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
  }, [screenToSvg, tool])

  const startResizeRect = useCallback((e: ReactMouseEvent, el: FloorElement, handle: string) => {
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
  }, [screenToSvg])

  const startResizePoly = useCallback((e: ReactMouseEvent, el: FloorElement, vertexIndex: number) => {
    if (el.type !== "polygon") return
    e.stopPropagation()
    setSelectedId(el.id)
    dragStateRef.current = {
      type: "resize-poly",
      elId: el.id,
      vertexIndex,
      startEl: el,
    }
  }, [])

  // ── Авто-подгонка при первом открытии редактора (когда DOM готов) ──
  const initialFitDone = useRef(false)
  useEffect(() => {
    if (initialFitDone.current) return
    const id = requestAnimationFrame(() => {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const w = layout.width * PX_PER_METER
      const h = layout.height * PX_PER_METER
      const padding = 20
      const sx = (rect.width - padding * 2) / w
      const sy = (rect.height - padding * 2) / h
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(sx, sy)))
      setZoom(next)
      setPan({
        x: (rect.width - w * next) / 2,
        y: (rect.height - h * next) / 2,
      })
      initialFitDone.current = true
    })
    return () => cancelAnimationFrame(id)
  }, [layout.width, layout.height])

  // ── Подгонка вида: зум и пан так чтобы весь холст помещался в SVG ──
  const fitToView = useCallback((target?: { width: number; height: number }) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const w = (target?.width ?? layout.width) * PX_PER_METER
    const h = (target?.height ?? layout.height) * PX_PER_METER
    const padding = 20
    const sx = (rect.width - padding * 2) / w
    const sy = (rect.height - padding * 2) / h
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(sx, sy)))
    setZoom(next)
    setPan({
      x: (rect.width - w * next) / 2,
      y: (rect.height - h * next) / 2,
    })
  }, [layout.width, layout.height])

  // ── Загрузка плана (PDF / картинка) с авто-подгонкой холста ──
  const [loadingPlan, setLoadingPlan] = useState(false)
  const handlePlanUpload = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Файл слишком большой, макс 15 МБ")
      return
    }
    setLoadingPlan(true)
    try {
      const { loadPlanFile } = await import("@/lib/pdf-render")
      const result = await loadPlanFile(file)
      // Спрашиваем реальную ширину плана в метрах. Это нужно, чтобы 1 клетка сетки = 1 метр.
      const promptMsg =
        `${result.source === "pdf" ? `PDF · стр. 1 из ${result.numPages ?? 1}` : "Картинка"}\n` +
        `Размер плана в пикселях: ${result.widthPx} × ${result.heightPx}.\n\n` +
        `Введите реальную ширину плана в метрах (по горизонтали).\n` +
        `Высота посчитается автоматически по аспекту изображения.\n` +
        `1 клетка сетки = 1 метр.`
      const widthInput = window.prompt(promptMsg, String(layout.width))
      if (widthInput === null) {
        // Отменили — всё равно ставим подложку с дефолтной шириной (юзер сможет калибровать позже).
        setLayout((p) => ({ ...p, underlayUrl: result.dataUrl }))
        toast.message("Подложка загружена. Используйте калибровку (линейка), чтобы выровнять масштаб.")
        return
      }
      const realWidth = parseFloat(widthInput.replace(",", "."))
      if (!Number.isFinite(realWidth) || realWidth <= 0 || realWidth > 1000) {
        toast.error("Введите корректную ширину (от 0.5 до 1000 м)")
        return
      }
      const realHeight = (realWidth * result.heightPx) / result.widthPx
      const newW = Math.round(realWidth * 10) / 10
      const newH = Math.round(realHeight * 10) / 10
      setLayout((p) => ({
        ...p,
        underlayUrl: result.dataUrl,
        width: newW,
        height: newH,
      }))
      // Авто-подгонка зума под новый холст с небольшой задержкой,
      // чтобы React успел применить новые размеры.
      requestAnimationFrame(() => fitToView({ width: newW, height: newH }))
      toast.success(`План загружен · ${realWidth.toFixed(1)} × ${realHeight.toFixed(1)} м · сетка 1 м`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить план")
    } finally {
      setLoadingPlan(false)
    }
  }

  // ── AI-распознавание помещений по подложке ───────────────────
  const [recognizing, setRecognizing] = useState(false)
  const handleRecognize = async () => {
    if (!layout.underlayUrl) {
      toast.error("Сначала загрузите план (PDF или картинку)")
      return
    }
    if (!layout.underlayUrl.startsWith("data:image/")) {
      toast.error("AI работает только с подложкой, загруженной как файл (PDF / картинка), не URL")
      return
    }
    setRecognizing(true)
    const t0 = Date.now()
    try {
      // Сжимаем картинку перед отправкой: Vercel ограничивает тело запроса ~4.5 МБ.
      // PDF, отрендеренный в PNG, легко превышает лимит.
      const { compressDataUrl } = await import("@/lib/pdf-render")
      const compressed = await compressDataUrl(layout.underlayUrl)
      const res = await fetch("/api/floor/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: compressed,
          floorName,
          floorNumber,
        }),
      })
      type AIRoom =
        | {
            shape: "rect"
            name: string
            kind: "rentable" | "common"
            x: number
            y: number
            width: number
            height: number
            area?: number | null
          }
        | {
            shape: "polygon"
            name: string
            kind: "rentable" | "common"
            points: Array<{ x: number; y: number }>
            area?: number | null
          }
      // Vercel/прокси при ошибке (413, 504) могут вернуть HTML вместо JSON
      const text = await res.text()
      let data: {
        error?: string
        rooms?: AIRoom[]
        buildingWidthMeters?: number | null
        ceilingHeightMeters?: number | null
      }
      try {
        data = JSON.parse(text)
      } catch {
        if (res.status === 413 || text.includes("Request Entity Too Large")) {
          toast.error("Картинка слишком большая. Загрузите PDF меньшего разрешения.")
        } else if (res.status === 504) {
          toast.error("AI не успел ответить за 60 сек. Попробуйте картинку поменьше.")
        } else {
          toast.error(`Сервер вернул не-JSON (HTTP ${res.status}). Возможно, AI ещё не настроен.`)
        }
        return
      }
      if (!res.ok) {
        // При ошибке парсинга AI выводим raw в консоль для диагностики
        const dataWithDebug = data as { error?: string; raw?: string; parseError?: string }
        if (process.env.NODE_ENV === "development") {
          if (dataWithDebug.raw) {
            console.warn("[AI recognize] raw response:", dataWithDebug.raw)
          }
          if (dataWithDebug.parseError) {
            console.warn("[AI recognize] parse error:", dataWithDebug.parseError)
          }
        }
        toast.error(data.error ?? `HTTP ${res.status}`)
        return
      }
      const recognized: AIRoom[] = data.rooms ?? []
      if (recognized.length === 0) {
        toast.error("AI не нашёл помещений. Попробуйте подложку лучшего качества.")
        return
      }

      // Если AI определил реальную ширину здания по dimension labels —
      // подгоняем размер холста чтобы 1м холста = 1м в реальности.
      // Аспект сохраняем (height пропорционально).
      let W = layout.width
      let H = layout.height
      const detectedW = data.buildingWidthMeters
      if (detectedW && detectedW > 0.5 && Math.abs(detectedW - W) > 0.5) {
        const aspect = layout.height / layout.width
        W = Math.round(detectedW * 10) / 10
        H = Math.round(detectedW * aspect * 10) / 10
        setLayout((prev) => ({ ...prev, width: W, height: H }))
        // подгоняем зум под новые размеры
        requestAnimationFrame(() => fitToView({ width: W, height: H }))
      }

      // Используем геометрию AI как есть — каждое помещение ставится точно
      // там, где AI его распознал на подложке.
      // Если форма полигональная (Г-образная, со скосом, кривой коридор) —
      // создаём polygon вместо rect.
      const newElements: FloorElement[] = recognized.map((r) => {
        if (r.shape === "polygon") {
          return {
            type: "polygon",
            id: uid(),
            kind: r.kind,
            points: r.points.map((p) => ({ x: snap(p.x * W), y: snap(p.y * H) })),
            label: r.name,
            spaceId: null,
          } as FloorElement
        }
        return {
          type: "rect",
          id: uid(),
          kind: r.kind,
          x: snap(r.x * W),
          y: snap(r.y * H),
          width: snap(Math.max(0.5, r.width * W)),
          height: snap(Math.max(0.5, r.height * H)),
          label: r.name,
          spaceId: null,
        } as FloorElement
      })

      // Сохраняем высоту потолка из плана для будущего 3D-вида
      if (data.ceilingHeightMeters && data.ceilingHeightMeters >= 2.0 && data.ceilingHeightMeters <= 6.0) {
        setLayout((prev) => ({ ...prev, ceilingHeight: data.ceilingHeightMeters ?? null }))
      }

      // Площадь этажа: предпочитаем сумму подписанных площадей (надёжнее),
      // иначе считаем по геометрии.
      const labeledSum = recognized.reduce((s, r) => s + (r.area && r.area > 0 ? r.area : 0), 0)
      const haveLabels = labeledSum > 0
      const sumGeom = newElements.reduce((s, el) => {
        if (el.type === "rect") return s + el.width * el.height
        return s
      }, 0)
      const baseSum = haveLabels ? labeledSum : sumGeom
      // С запасом 5% на стены — реальная площадь этажа всегда чуть больше суммы помещений.
      const proposedTotal = Math.ceil(baseSum * 1.05 * 10) / 10

      setLayout((prev) => ({ ...prev, elements: [...prev.elements, ...newElements] }))
      setTotalArea(proposedTotal)
      setSelectedId(null)

      const rentableCount = recognized.filter((r) => r.kind === "rentable").length
      const commonCount = recognized.length - rentableCount
      const labeledCount = recognized.filter((r) => r.area && r.area > 0).length
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      const widthNote = detectedW ? ` · Ширина: ${detectedW.toFixed(1)} м` : ""
      const ceilingNote = data.ceilingHeightMeters
        ? ` · Потолок: ${data.ceilingHeightMeters} м`
        : ""
      const labeledNote = labeledCount > 0
        ? ` · Площади со штампа: ${labeledCount}/${recognized.length}`
        : ""
      toast.success(
        `AI распознал ${recognized.length} помещений за ${elapsed}с · ${rentableCount} аренд. + ${commonCount} общ.${labeledNote}${widthNote}${ceilingNote} · ` +
          `Σ этажа: ${proposedTotal} м²`,
        { duration: 8000 },
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Сбой запроса к AI")
    } finally {
      setRecognizing(false)
    }
  }

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await saveFloorLayout(floorId, JSON.stringify(layout), totalArea)
      toast.success("План сохранён")
      // Если Σ этажей > площади здания — предложим обновить здание
      if (result.buildingNeedsUpdate) {
        const proposed = Math.round(result.sumFloorArea * 10) / 10
        const current = result.buildingTotalArea
        toast(
          `Σ этажей ${proposed} м²${current ? ` > здания ${current} м²` : " · у здания не задана общая площадь"}. Обновить здание?`,
          {
            duration: 12000,
            action: {
              label: "Обновить",
              onClick: async () => {
                try {
                  const r = await setBuildingAreaFromFloors(result.buildingId)
                  toast.success(`Площадь здания установлена: ${r.totalArea} м²`)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Не удалось обновить здание")
                }
              },
            },
          },
        )
      }
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
        return
      }
      // Стрелки → панорама (с зажатым Shift — крупный шаг)
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault()
        const step = e.shiftKey ? 80 : 20
        if (e.key === "ArrowUp") setPan((p) => ({ ...p, y: p.y + step }))
        if (e.key === "ArrowDown") setPan((p) => ({ ...p, y: p.y - step }))
        if (e.key === "ArrowLeft") setPan((p) => ({ ...p, x: p.x + step }))
        if (e.key === "ArrowRight") setPan((p) => ({ ...p, x: p.x - step }))
        return
      }
      // +/- для зума с клавиатуры
      if (e.key === "+" || e.key === "=") {
        setZoom((z) => Math.min(MAX_ZOOM, z * 1.15))
        return
      }
      if (e.key === "-" || e.key === "_") {
        setZoom((z) => Math.max(MIN_ZOOM, z / 1.15))
        return
      }
      // F → fit-to-view
      if (e.key === "f" || e.key === "F") {
        fitToView()
        return
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

  const spaceById = useMemo(() => new Map(spaces.map((space) => [space.id, space])), [spaces])
  const selected = useMemo(
    () => layout.elements.find((element) => element.id === selectedId) ?? null,
    [layout.elements, selectedId],
  )
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
            type="button"
            onClick={() => { setTool(t.id); setPolygonInProgress(null) }}
            aria-label={t.label}
            title={t.label}
            className={`flex h-10 items-center justify-center rounded-lg transition ${
              tool === t.id ? "bg-blue-600 text-white" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
            }`}
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
        <div className="h-px bg-slate-200 my-1" />
        <button
          type="button"
          onClick={() => setShowGrid(!showGrid)}
          aria-label="Сетка"
          title="Сетка (G)"
          className={`flex h-10 items-center justify-center rounded-lg transition ${
            showGrid ? "bg-slate-200" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
          }`}
        >
          <GridIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.2))}
          aria-label="Увеличить"
          title="Увеличить"
          className="flex h-10 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.2))}
          aria-label="Уменьшить"
          title="Уменьшить"
          className="flex h-10 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => fitToView()}
          aria-label="Подогнать план"
          title="Подогнать (вместить весь план в экран)"
          className="flex h-10 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">{floorName}</span>
            {" · "}
            {tool === "rect" && "Растяните прямоугольник"}
            {tool === "polygon" && (polygonInProgress ? `Кликайте вершины (${polygonInProgress.length}). Двойной клик — завершить.` : "Кликайте вершины контура. Двойной клик — завершить. Подходит для непрямоугольных коридоров.")}
            {tool === "door" && "Кликните чтобы поставить дверь"}
            {tool === "wall" && "Растяните линию"}
            {tool === "label" && "Кликните чтобы добавить подпись"}
            {tool === "select" && "Shift+drag — панорама. Ctrl+wheel — зум. Del — удалить"}
          </p>
          {(tool === "rect" || tool === "polygon") && (
            <div className="flex items-center gap-1.5 ml-3">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Тип:</span>
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setDrawKind("rentable")}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    drawKind === "rentable"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  Арендуемое
                </button>
                <button
                  type="button"
                  onClick={() => setDrawKind("common")}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    drawKind === "common"
                      ? "bg-slate-600 text-white"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  Общая зона
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {/* Режимы отображения */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setDisplayMode("full")}
                title="Полный вид"
                className={`px-2 py-1 rounded text-xs ${displayMode === "full" ? "bg-white dark:bg-slate-900 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
              >
                Полный
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode("outline")}
                title="Только контур"
                className={`px-2 py-1 rounded text-xs ${displayMode === "outline" ? "bg-white dark:bg-slate-900 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
              >
                Контур
              </button>
              {layout.underlayUrl && (
                <button
                  type="button"
                  onClick={() => setDisplayMode("underlay-only")}
                  title="Только подложка"
                  className={`px-2 py-1 rounded text-xs ${displayMode === "underlay-only" ? "bg-white dark:bg-slate-900 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  Подложка
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setView3D(!view3D)}
              aria-label="Живое 3D (сплит-экран)"
              title="Живое 3D: рисуйте слева — справа сразу растёт объёмный этаж. Комнаты можно таскать прямо в 3D."
              className={`p-2 rounded-lg ${view3D ? "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"}`}
            >
              <Box className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setCalibration({ active: !calibration.active, first: null, second: null })}
              aria-label="Калибровка масштаба"
              title="Калибровка масштаба (клик 2 точки)"
              className={`p-2 rounded-lg ${calibration.active ? "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"}`}
            >
              <Ruler className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={rotatePlan}
              aria-label="Повернуть план на 90°"
              title="Повернуть план на 90° (вертикальный ↔ горизонтальный): холст, подложка и элементы"
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
            >
              <RotateCw className="h-4 w-4" />
            </button>

            <span className="w-px h-5 bg-slate-200 mx-1" />

            <button
              type="button"
              onClick={undo}
              aria-label="Отменить"
              disabled={history.length === 0}
              title="Отменить (Ctrl+Z)"
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              aria-label="Повторить"
              disabled={future.length === 0}
              title="Повторить (Ctrl+Y)"
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={copySelected}
              aria-label="Копировать"
              disabled={!selectedId}
              title="Копировать (Ctrl+C)"
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => fitToView()}
              aria-label="Подогнать вид"
              title="Подогнать вид (вместить весь план в экран)"
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <ConfirmDialog
              variant="danger"
              title={`Удалить все ${layout.elements.length} элемент${layout.elements.length === 1 ? "" : "ов"} с плана?`}
              description="Подложка, общая площадь и сетка останутся. Можно отменить через Ctrl+Z до сохранения."
              confirmLabel="Стереть"
              onConfirm={() => {
                setLayout((p) => ({ ...p, elements: [] }))
                setSelectedId(null)
                setPolygonInProgress(null)
                toast.success("Все элементы стёрты. Не забудьте сохранить.")
              }}
              trigger={
                <button
                  type="button"
                  disabled={layout.elements.length === 0}
                  aria-label="Очистить план"
                  title="Очистить все нарисованные элементы"
                  className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Eraser className="h-4 w-4" />
                </button>
              }
            />
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">{Math.round(zoom * 100)}%</span>
            {f16Template && (() => {
              const applyTemplate = () => {
                // f16Template — проп (FloorLayoutV2|null), не ref; applyTemplate
                // вызывается по клику/подтверждению, а не во время рендера, поэтому
                // чтение ref внутри setLayout здесь безопасно (ложное срабатывание правила).
                // eslint-disable-next-line react-hooks/refs
                setLayout(f16Template)
                setSelectedId(null)
                toast.success(`Шаблон этажа ${floorNumber} загружен — теперь сохраните`)
              }
              const className = "flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
              if (layout.elements.length > 0) {
                return (
                  <ConfirmDialog
                    title="Заменить текущий план?"
                    description="Текущий план будет заменён шаблоном БЦ F16."
                    confirmLabel="Заменить"
                    onConfirm={applyTemplate}
                    trigger={
                      <button
                        type="button"
                        className={className}
                        title="Импорт готового плана этажа из отсканированных документов БЦ F16"
                      >
                        <Sparkles className="h-4 w-4" />
                        Шаблон F16
                      </button>
                    }
                  />
                )
              }
              return (
                <button
                  type="button"
                  onClick={applyTemplate}
                  className={className}
                  title="Импорт готового плана этажа из отсканированных документов БЦ F16"
                >
                  <Sparkles className="h-4 w-4" />
                  Шаблон F16
                </button>
              )
            })()}
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              title="Готовые шаблоны планов (этаж/крыша/территория)"
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <TemplateIcon className="h-4 w-4" />
              Шаблоны
            </button>
            <AiLayoutButton
              floorKind={floorKind}
              width={layout.width}
              height={layout.height}
              floorName={floorName}
              hasElements={layout.elements.length > 0}
              onApply={(next) => { setLayoutRaw(next); setSelectedId(null) }}
            />
            {layout.underlayUrl?.startsWith("data:image/") && (() => {
              const buttonInner = recognizing ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Распознавание...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  AI распознать
                </>
              )
              const className = "flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
              if (layout.elements.length > 0) {
                return (
                  <ConfirmDialog
                    title={`На плане уже ${layout.elements.length} элементов`}
                    description="AI добавит распознанные помещения сверх существующих. Если хотите начать с чистого плана — отмените, удалите все элементы вручную, и попробуйте снова."
                    confirmLabel="Продолжить"
                    onConfirm={handleRecognize}
                    trigger={
                      <button
                        type="button"
                        disabled={recognizing}
                        title="Прислать подложку Claude AI и автоматически расставить прямоугольники помещений"
                        className={className}
                      >
                        {buttonInner}
                      </button>
                    }
                  />
                )
              }
              return (
                <button
                  type="button"
                  onClick={handleRecognize}
                  disabled={recognizing}
                  title="Прислать подложку Claude AI и автоматически расставить прямоугольники помещений"
                  className={className}
                >
                  {buttonInner}
                </button>
              )
            })()}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>

        <div className="flex-1 flex bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
          {/* Информер по калибровке */}
          {calibration.active && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-orange-100 dark:bg-orange-500/20 border border-orange-300 dark:border-orange-500/40 rounded-lg px-4 py-2 text-xs text-orange-800 dark:text-orange-200 shadow-lg">
              {!calibration.first
                ? "📍 Кликните по первой точке известного расстояния"
                : "📍 Теперь кликните по второй точке"}
              <button type="button" onClick={() => setCalibration({ active: false, first: null, second: null })}
                className="ml-3 text-orange-600 dark:text-orange-400 underline">Отмена</button>
            </div>
          )}

          <div className={`relative h-full ${view3D ? "w-1/2 border-r-2 border-slate-300 dark:border-slate-700" : "w-full"}`}>
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{
              cursor: calibration.active ? "crosshair" : tool === "select" ? "default" : "crosshair",
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
              {/* Underlay image — сохраняем пропорции картинки, чтобы план не растягивался и ничего не обрезалось */}
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

              {/* Опорный контур здания на территории — здание «стоит» на участке. */}
              {floorKind === "TERRITORY" && buildingFootprint && (() => {
                const fw = buildingFootprint.width * PX_PER_METER
                const fd = buildingFootprint.depth * PX_PER_METER
                const fx = Math.max(0, (layout.width * PX_PER_METER - fw) / 2)
                const fy = Math.max(0, (layout.height * PX_PER_METER - fd) / 2)
                return (
                  <g pointerEvents="none">
                    <rect
                      x={fx} y={fy} width={fw} height={fd}
                      fill="#94a3b8" fillOpacity={0.18}
                      stroke="#64748b" strokeWidth={2 / zoom}
                      strokeDasharray={`${8 / zoom} ${5 / zoom}`}
                    />
                    <text
                      x={fx + fw / 2} y={fy + fd / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={14 / zoom} fill="#475569" fontWeight={600}
                    >
                      🏢 {buildingFootprint.name}
                    </text>
                  </g>
                )
              })()}

              {/* Elements */}
              {displayMode !== "underlay-only" && layout.elements.map((el) => (
                <RenderElement
                  key={el.id}
                  el={el}
                  selected={el.id === selectedId}
                  zoom={zoom}
                  spaceById={spaceById}
                  outlineOnly={displayMode === "outline"}
                  onMoveStart={startMove}
                  onRectResizeStart={startResizeRect}
                  onPolyResizeStart={startResizePoly}
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

              {/* Snap target: жёлтый круг когда курсор близко к точке стены/угла */}
              {snapTarget && (
                <g pointerEvents="none">
                  <circle
                    cx={snapTarget.x * PX_PER_METER}
                    cy={snapTarget.y * PX_PER_METER}
                    r={10 / zoom}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth={2.5 / zoom}
                  />
                  <circle
                    cx={snapTarget.x * PX_PER_METER}
                    cy={snapTarget.y * PX_PER_METER}
                    r={3 / zoom}
                    fill="#facc15"
                  />
                </g>
              )}
            </g>
          </svg>

          {/* Scale indicator */}
          <div className="absolute bottom-3 right-3 bg-white dark:bg-slate-900/90 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
            <div style={{ width: px, height: 6, background: "linear-gradient(to right, black 50%, white 50%)", border: "1px solid black" }} />
            1 метр
          </div>
          </div>

          {/* Живое 3D: обновляется по мере рисования, комнаты можно таскать прямо в 3D */}
          {view3D && (
            <div className="relative h-full w-1/2 bg-slate-50 dark:bg-slate-900">
              <Floor3DPanel
                layout={layout3d}
                spaces={spaces3d}
                selectedId={selectedId}
                onSelect={setSelectedId}
                editable
                onMoveElement={moveElementBy}
              />
              <div className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/70 px-3 py-1 text-[10px] text-white backdrop-blur pointer-events-none whitespace-nowrap">
                Живое 3D · вращение мышью · комнаты и объекты можно перетаскивать
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Properties */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <UnderlayPanel
          underlayUrl={layout.underlayUrl ?? null}
          opacity={underlayOpacity}
          setOpacity={setUnderlayOpacity}
          loading={loadingPlan}
          onUpload={(file) => void handlePlanUpload(file)}
          onSetUrl={(url) => setLayout((p) => ({ ...p, underlayUrl: url }))}
          onRemove={() => setLayout((p) => ({ ...p, underlayUrl: null }))}
        />

        {/* Insert room by dimensions */}
        <InsertRoomPanel
          onInsert={(name, w, h, kind) => {
            const spot = findFreeSpot(w, h)
            const id = addRect(spot.x, spot.y, w, h, name, kind)
            setSelectedId(id)
            setTool("select")
            const kindLabel = kind === "common" ? "Общая зона" : "Помещение"
            toast.success(`${kindLabel} «${name || `${w}×${h}`}» добавлено`)
          }}
        />

        {/* Areas breakdown + floor total */}
        <AreasPanel
          layout={layout}
          totalArea={totalArea}
          setTotalArea={setTotalArea}
          setLayout={setLayout}
        />

        {/* Danger zone: reset / delete */}
        <DangerZone
          floorId={floorId}
          floorName={floorName}
          spacesCount={spaces.length}
          elementsCount={layout.elements.length}
          onClearElements={() => {
            setLayout((prev) => ({ ...prev, elements: [] }))
            setSelectedId(null)
            setPolygonInProgress(null)
            toast.success("Все элементы стёрты. Не забудьте сохранить.")
          }}
          onPlanCleared={() => {
            setLayoutRaw(DEFAULT_LAYOUT)
            setTotalArea(null)
            setHistory([])
            setFuture([])
            setSelectedId(null)
          }}
          onFloorDeleted={() => router.push("/admin/buildings")}
        />

        {/* Selected element properties */}
        {selected ? (
          <PropertiesPanel
            element={selected}
            spaces={spaces}
            onUpdate={(patch) => updateElement(selected.id, patch)}
            onDelete={() => deleteElement(selected.id)}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400">
            <FloorHints floorKind={floorKind} />
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Выделите элемент</p>
            <p>Кликните по элементу на плане чтобы редактировать его свойства.</p>
            <div className="mt-3 space-y-1 text-slate-500 dark:text-slate-400">
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

      {showTemplates && (
        <TemplateGallery
          initialCategory={floorKind === "ROOF" ? "roof" : floorKind === "TERRITORY" ? "territory" : "floor"}
          hasExisting={layout.elements.length > 0}
          onApply={(next) => {
            setLayout(next)
            setSelectedId(null)
            setPolygonInProgress(null)
            toast.success("Шаблон загружен — отредактируйте и сохраните")
          }}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  )
}

// scaleElement / rotateImage90 / snap / findNearestVertex / useDebounced /
// PanelSkeleton вынесены в ./floor-editor-utils (performance-gate < 75 КБ).
