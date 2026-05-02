"use client"

import { useState, useRef, useEffect, useCallback, MouseEvent as ReactMouseEvent } from "react"
import { saveFloorLayout, setBuildingAreaFromFloors, clearFloorPlan } from "@/app/actions/floor-layout"
import { deleteAllSpacesOnFloor } from "@/app/actions/spaces"
import { deleteFloor } from "@/app/actions/buildings"
import { useRouter } from "next/navigation"
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
  type RoomKind,
  DEFAULT_LAYOUT,
  uid,
  polygonArea,
  elementCenter,
  summarizeAreas,
} from "@/lib/floor-layout"
import { getF16TemplateByFloorNumber } from "@/lib/f16-templates"
import { loadPlanFile, compressDataUrl } from "@/lib/pdf-render"

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
  initialTotalArea,
  spaces,
}: {
  floorId: string
  floorName: string
  floorNumber: number
  initialLayout: FloorLayoutV2 | null
  initialTotalArea?: number | null
  spaces: SpaceLite[]
}) {
  const router = useRouter()
  const f16Template = getF16TemplateByFloorNumber(floorNumber)
  const [layout, setLayoutRaw] = useState<FloorLayoutV2>(() => initialLayout ?? DEFAULT_LAYOUT)
  const [totalArea, setTotalArea] = useState<number | null>(initialTotalArea ?? null)
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

  // ── Загрузка плана (PDF / картинка) с авто-подгонкой холста ──
  const [loadingPlan, setLoadingPlan] = useState(false)
  const handlePlanUpload = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Файл слишком большой, макс 15 МБ")
      return
    }
    setLoadingPlan(true)
    try {
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
      setLayout((p) => ({
        ...p,
        underlayUrl: result.dataUrl,
        width: Math.round(realWidth * 10) / 10,
        height: Math.round(realHeight * 10) / 10,
      }))
      // Сбрасываем зум/панораму чтобы план целиком был виден
      setZoom(1)
      setPan({ x: 0, y: 0 })
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
    if (layout.elements.length > 0) {
      const ok = window.confirm(
        `На плане уже ${layout.elements.length} элементов. AI добавит распознанные помещения сверх существующих. Продолжить?\n\n` +
          `(Если хотите начать с чистого плана — отмените, удалите все элементы вручную, и попробуйте снова.)`,
      )
      if (!ok) return
    }
    setRecognizing(true)
    const t0 = Date.now()
    try {
      // Сжимаем картинку перед отправкой: Vercel ограничивает тело запроса ~4.5 МБ.
      // PDF, отрендеренный в PNG, легко превышает лимит.
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
      // Vercel/прокси при ошибке (413, 504) могут вернуть HTML вместо JSON
      const text = await res.text()
      let data: { error?: string; rooms?: Array<{ name: string; kind: "rentable" | "common"; x: number; y: number; width: number; height: number }> }
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
        toast.error(data.error ?? `HTTP ${res.status}`)
        return
      }
      const recognized: Array<{ name: string; kind: "rentable" | "common"; x: number; y: number; width: number; height: number }> = data.rooms ?? []
      if (recognized.length === 0) {
        toast.error("AI не нашёл помещений. Попробуйте подложку лучшего качества.")
        return
      }

      // Конвертируем доли [0..1] в метры через текущий размер холста
      const W = layout.width
      const H = layout.height
      const newElements: FloorElement[] = recognized.map((r) => ({
        type: "rect",
        id: uid(),
        kind: r.kind,
        x: snap(r.x * W),
        y: snap(r.y * H),
        width: snap(Math.max(0.5, r.width * W)),
        height: snap(Math.max(0.5, r.height * H)),
        label: r.name,
        spaceId: null,
      }))

      // Суммарная площадь распознанных помещений → автоматически в Floor.totalArea.
      // Округляем вверх с запасом 5% на стены.
      const sumNew = newElements.reduce((s, el) => {
        if (el.type === "rect") return s + el.width * el.height
        return s
      }, 0)
      const proposedTotal = Math.ceil(sumNew * 1.05 * 10) / 10

      setLayout((prev) => ({ ...prev, elements: [...prev.elements, ...newElements] }))
      setTotalArea(proposedTotal)
      setSelectedId(null)

      const rentableCount = recognized.filter((r) => r.kind === "rentable").length
      const commonCount = recognized.length - rentableCount
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      toast.success(
        `AI распознал ${recognized.length} помещений за ${elapsed}с · ${rentableCount} аренд. + ${commonCount} общ. · ` +
          `Площадь этажа: ${proposedTotal} м² (с 5% запасом на стены)`,
        { duration: 6000 },
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
            {layout.underlayUrl?.startsWith("data:image/") && (
              <button
                onClick={handleRecognize}
                disabled={recognizing}
                title="Прислать подложку Claude AI и автоматически расставить прямоугольники помещений"
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
              >
                {recognizing ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Распознавание...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    AI распознать
                  </>
                )}
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
              {/* Underlay image — растягиваем точно под холст, аспект задаётся при загрузке */}
              {layout.underlayUrl && (
                <image
                  href={layout.underlayUrl}
                  x={0}
                  y={0}
                  width={layout.width * PX_PER_METER}
                  height={layout.height * PX_PER_METER}
                  opacity={underlayOpacity}
                  preserveAspectRatio="none"
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
            <div className="space-y-2">
              <label className={`block text-xs cursor-pointer ${loadingPlan ? "pointer-events-none opacity-60" : ""}`}>
                <span className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm font-medium transition-colors">
                  {loadingPlan ? (
                    <>
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Загрузка...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4" />
                      Загрузить план (PDF / картинка)
                    </>
                  )}
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  disabled={loadingPlan}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handlePlanUpload(file)
                    e.target.value = ""
                  }}
                />
              </label>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                Загрузите PDF или PNG/JPG плана этажа. Система спросит реальную ширину
                плана и автоматически подгонит холст так, чтобы <b>1 клетка = 1 метр</b>.
              </p>
              <details className="group">
                <summary className="text-[10px] text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
                  ▸ Или вставить URL картинки
                </summary>
                <input
                  type="url"
                  placeholder="https://..."
                  onChange={(e) => {
                    const url = e.target.value.trim()
                    if (url) setLayout((p) => ({ ...p, underlayUrl: url }))
                  }}
                  className="w-full mt-1.5 rounded border border-slate-200 dark:border-slate-800 px-2 py-1 text-xs"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Прямая ссылка на изображение (Google Drive / Dropbox / любой CDN). Аспект холста придётся настроить вручную.
                </p>
              </details>
            </div>
          )}
        </div>

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
  const isCommon = (el.type === "rect" || el.type === "polygon") && el.kind === "common"
  const status = linkedSpace?.status ?? (isCommon ? "COMMON" : "UNLINKED")
  // Common area: нейтральная серая заливка, dashed обводка
  const COMMON_FILL = "#f1f5f9"
  const COMMON_STROKE = "#94a3b8"
  const fill = outlineOnly ? "transparent"
    : isCommon ? COMMON_FILL
    : (STATUS_FILL[status] ?? STATUS_FILL.UNLINKED)
  const stroke = selected ? "#3b82f6"
    : isCommon ? COMMON_STROKE
    : (STATUS_STROKE[status] ?? STATUS_STROKE.UNLINKED)
  const strokeWidth = selected ? 3 / zoom : 1.5 / zoom
  const strokeDasharray = isCommon && !selected ? `${4 / zoom} ${3 / zoom}` : undefined

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
          strokeDasharray={strokeDasharray}
        />
        <text
          x={center.x * PX_PER_METER}
          y={center.y * PX_PER_METER}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={14 / zoom}
          fill={isCommon ? "#475569" : "#0f172a"}
          fontWeight={600}
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {linkedSpace ? `Каб. ${linkedSpace.number}` : (el.label || (isCommon ? "Общая зона" : ""))}
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
          strokeDasharray={strokeDasharray}
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
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Тип помещения</label>
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
              <button
                onClick={() => onUpdate({ kind: "rentable", spaceId: element.spaceId ?? null } as Partial<FloorElement>)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  (element.kind ?? "rentable") === "rentable"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                Арендуемое
              </button>
              <button
                onClick={() => onUpdate({ kind: "common", spaceId: null } as Partial<FloorElement>)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  element.kind === "common"
                    ? "bg-slate-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                Общая зона
              </button>
            </div>
          </div>
          {element.kind !== "common" && (
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Связать со Space</label>
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
          )}
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Подпись</label>
            <input
              value={element.label ?? ""}
              onChange={(e) => onUpdate({ label: e.target.value } as Partial<FloorElement>)}
              placeholder={element.kind === "common" ? "Коридор / Туалет / Тех ..." : "Холл / Кабинет / ..."}
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

// ── Insert room by dimensions / area ───────────────────────────
function InsertRoomPanel({ onInsert }: { onInsert: (name: string, width: number, height: number, kind: RoomKind) => void }) {
  const [mode, setMode] = useState<"lw" | "area">("lw")
  const [kind, setKind] = useState<RoomKind>("rentable")
  const [name, setName] = useState("")
  const [length, setLength] = useState<string>("4")
  const [width, setWidth] = useState<string>("3")
  const [area, setArea] = useState<string>("12")
  const [areaSide, setAreaSide] = useState<string>("4")
  const [areaSideKind, setAreaSideKind] = useState<"length" | "width">("length")

  const numL = parseFloat(length.replace(",", ".")) || 0
  const numW = parseFloat(width.replace(",", ".")) || 0
  const numA = parseFloat(area.replace(",", ".")) || 0
  const numSide = parseFloat(areaSide.replace(",", ".")) || 0

  let computedArea = 0
  let computedL = 0
  let computedW = 0

  if (mode === "lw") {
    computedL = numL
    computedW = numW
    computedArea = numL * numW
  } else {
    computedArea = numA
    if (numSide > 0 && numA > 0) {
      const other = numA / numSide
      if (areaSideKind === "length") {
        computedL = numSide
        computedW = other
      } else {
        computedW = numSide
        computedL = other
      }
    }
  }

  const canInsert = computedL > 0.1 && computedW > 0.1 && computedL <= 100 && computedW <= 100

  const handle = () => {
    if (!canInsert) {
      toast.error("Укажите корректные размеры (от 0.1 до 100 м)")
      return
    }
    onInsert(name.trim(), Math.round(computedL * 100) / 100, Math.round(computedW * 100) / 100, kind)
    setName("")
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
          <Square className="h-3.5 w-3.5" />
          Вставить помещение
        </p>
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
          <button
            onClick={() => setMode("lw")}
            className={`px-2 py-0.5 rounded text-[10px] font-medium ${mode === "lw" ? "bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
          >
            Д × Ш
          </button>
          <button
            onClick={() => setMode("area")}
            className={`px-2 py-0.5 rounded text-[10px] font-medium ${mode === "area" ? "bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
          >
            м² + сторона
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <button
          onClick={() => setKind("rentable")}
          className={`flex flex-col items-center justify-center px-2 py-1.5 rounded-md text-[11px] font-medium transition ${
            kind === "rentable"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
          title="Помещение, которое сдаётся в аренду (можно привязать к Space)"
        >
          <span>Арендуемое</span>
          <span className="text-[9px] opacity-80">кабинет / офис</span>
        </button>
        <button
          onClick={() => setKind("common")}
          className={`flex flex-col items-center justify-center px-2 py-1.5 rounded-md text-[11px] font-medium transition ${
            kind === "common"
              ? "bg-slate-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
          title="Общая зона, которая не сдаётся (коридор, тех.помещение)"
        >
          <span>Общая зона</span>
          <span className="text-[9px] opacity-80">коридор / тех</span>
        </button>
      </div>

      <div>
        <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Название (необязательно)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "common" ? "Коридор / Туалет / Тех ..." : "Кабинет / Офис / 101 ..."}
          className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
        />
      </div>

      {mode === "lw" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Длина (м)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Ширина (м)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Площадь (м²)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Известная сторона (м)</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={areaSide}
                onChange={(e) => setAreaSide(e.target.value)}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
              />
            </div>
            <select
              value={areaSideKind}
              onChange={(e) => setAreaSideKind(e.target.value as "length" | "width")}
              className="rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
            >
              <option value="length">— длина</option>
              <option value="width">— ширина</option>
            </select>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between text-blue-700 dark:text-blue-300">
          <span>Площадь:</span>
          <b>{computedArea > 0 ? `${computedArea.toFixed(2)} м²` : "—"}</b>
        </div>
        <div className="flex items-center justify-between text-blue-600/80 dark:text-blue-400/80 mt-0.5">
          <span>Размер:</span>
          <b>{computedL > 0 && computedW > 0 ? `${computedL.toFixed(2)} × ${computedW.toFixed(2)} м` : "—"}</b>
        </div>
      </div>

      <button
        onClick={handle}
        disabled={!canInsert}
        className={`w-full flex items-center justify-center gap-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 text-sm font-medium transition-colors ${
          kind === "common" ? "bg-slate-700 hover:bg-slate-800" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        <Square className="h-4 w-4" />
        {kind === "common" ? "Вставить общую зону" : "Вставить помещение"}
      </button>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 -mt-1">
        {kind === "common"
          ? "Общая зона входит в общую площадь этажа, но не сдаётся в аренду."
          : "Помещение войдёт в арендопригодную площадь и может быть привязано к Space."}
      </p>
    </div>
  )
}

// ── Areas breakdown panel: rentable + common = drawn, vs Floor.totalArea ─
// ── Danger zone: clear plan / delete spaces / delete floor ─────
function DangerZone({
  floorId, floorName, spacesCount, onPlanCleared, onFloorDeleted,
}: {
  floorId: string
  floorName: string
  spacesCount: number
  onPlanCleared: () => void
  onFloorDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const handleClearPlan = async () => {
    if (!window.confirm(
      `Очистить нарисованный план «${floorName}»?\n\n` +
      `Будут стёрты:\n• Все нарисованные прямоугольники, стены, двери, иконки\n• Подложка (фото плана)\n• Общая площадь этажа\n\n` +
      `Помещения (Space) останутся на месте — это только визуальный слой.`,
    )) return
    setBusy("plan")
    try {
      await clearFloorPlan(floorId)
      onPlanCleared()
      toast.success("План очищен. Можно рисовать заново.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось очистить")
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteAllSpaces = async () => {
    if (spacesCount === 0) {
      toast.message("На этаже нет помещений")
      return
    }
    if (!window.confirm(
      `Удалить ВСЕ ${spacesCount} помещени${spacesCount === 1 ? "е" : spacesCount < 5 ? "я" : "й"} этажа «${floorName}»?\n\n` +
      `⚠ Помещения с активными арендаторами удалить нельзя — придётся сначала выселить.\n\n` +
      `Это действие необратимо.`,
    )) return
    setBusy("spaces")
    try {
      const r = await deleteAllSpacesOnFloor(floorId)
      toast.success(`Удалено помещений: ${r.count}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось удалить")
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteFloor = async () => {
    const cascade = spacesCount > 0
    const cascadeNote = cascade
      ? `\n\nНа этаже ${spacesCount} помещени${spacesCount === 1 ? "е" : spacesCount < 5 ? "я" : "й"} — они тоже будут удалены (если ни одно не занято арендатором).`
      : ""
    if (!window.confirm(
      `УДАЛИТЬ ЭТАЖ «${floorName}» полностью?${cascadeNote}\n\n` +
      `⚠ Это действие необратимо. План, помещения и сам этаж исчезнут безвозвратно.`,
    )) return
    if (!window.confirm("Точно удалить? Это последнее предупреждение.")) return
    setBusy("floor")
    try {
      await deleteFloor(floorId, { cascade })
      toast.success(`Этаж «${floorName}» удалён`)
      onFloorDeleted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось удалить")
      setBusy(null)
    }
  }

  return (
    <details
      className="bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-500/30 overflow-hidden"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="px-4 py-3 cursor-pointer text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide flex items-center gap-1.5 hover:bg-red-50/50 dark:hover:bg-red-500/5">
        <Trash2 className="h-3.5 w-3.5" />
        Опасная зона
      </summary>
      <div className="px-4 py-3 space-y-2 border-t border-red-100 dark:border-red-500/20">
        <button
          onClick={handleClearPlan}
          disabled={!!busy}
          className="w-full text-left px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 hover:bg-amber-100 dark:hover:bg-amber-500/10 disabled:opacity-50"
        >
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {busy === "plan" ? "Очистка..." : "Очистить план"}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Стирает рисунок, подложку и общ. площадь. Помещения остаются.
          </p>
        </button>

        <button
          onClick={handleDeleteAllSpaces}
          disabled={!!busy || spacesCount === 0}
          className="w-full text-left px-3 py-2 rounded-lg border border-orange-200 dark:border-orange-500/30 bg-orange-50/50 dark:bg-orange-500/5 hover:bg-orange-100 dark:hover:bg-orange-500/10 disabled:opacity-50"
        >
          <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
            {busy === "spaces" ? "Удаление..." : `Удалить все помещения (${spacesCount})`}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Массово удалит Space-записи. Только если ни одно не занято.
          </p>
        </button>

        <button
          onClick={handleDeleteFloor}
          disabled={!!busy}
          className="w-full text-left px-3 py-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5 hover:bg-red-100 dark:hover:bg-red-500/10 disabled:opacity-50"
        >
          <p className="text-xs font-medium text-red-700 dark:text-red-300">
            {busy === "floor" ? "Удаление..." : "Удалить этаж целиком"}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Удалит этаж со всеми помещениями (если ни одно не занято).
          </p>
        </button>
      </div>
    </details>
  )
}

function AreasPanel({
  layout, totalArea, setTotalArea, setLayout,
}: {
  layout: FloorLayoutV2
  totalArea: number | null
  setTotalArea: (v: number | null) => void
  setLayout: (next: FloorLayoutV2 | ((prev: FloorLayoutV2) => FloorLayoutV2)) => void
}) {
  const sums = summarizeAreas(layout)
  const hasFloorArea = totalArea !== null && totalArea > 0
  const remaining = hasFloorArea ? (totalArea - sums.total) : null
  // Допуск 5% на стены/конструкции
  const tolerance = hasFloorArea ? totalArea * 0.05 : 0
  const overflow = hasFloorArea && sums.total > totalArea + 0.01
  const tightFit = hasFloorArea && remaining !== null && remaining < tolerance && !overflow

  const pctRentable = hasFloorArea && totalArea > 0 ? Math.min(100, (sums.rentable / totalArea) * 100) : 0
  const pctCommon = hasFloorArea && totalArea > 0 ? Math.min(100, (sums.common / totalArea) * 100) : 0
  const pctOver = overflow ? Math.min(100, ((sums.total - totalArea) / totalArea) * 100) : 0

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Площади этажа</p>

      <div>
        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
          Общая площадь этажа (м²)
          <span className="ml-1 text-[10px] text-slate-300 dark:text-slate-600">из тех. паспорта</span>
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="напр. 250"
            value={totalArea ?? ""}
            onChange={(e) => {
              const v = e.target.value
              setTotalArea(v === "" ? null : Math.max(0, parseFloat(v) || 0))
            }}
            className="flex-1 rounded border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
          />
          <button
            onClick={() => {
              if (sums.total > 0) {
                setTotalArea(Math.round(sums.total * 10) / 10)
                toast.success("Площадь рассчитана из нарисованного")
              } else {
                toast.error("Сначала добавьте помещения на план")
              }
            }}
            title="Подставить сумму нарисованных помещений и общих зон"
            className="rounded border border-slate-200 dark:border-slate-800 px-2 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Σ
          </button>
        </div>
      </div>

      {/* Stacked breakdown */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className="w-2 h-2 rounded-sm bg-emerald-500" />
            Арендопригодные
          </span>
          <b className="tabular-nums text-slate-700 dark:text-slate-300">{sums.rentable.toFixed(1)} м²</b>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className="w-2 h-2 rounded-sm bg-slate-400" />
            Общие зоны
          </span>
          <b className="tabular-nums text-slate-700 dark:text-slate-300">{sums.common.toFixed(1)} м²</b>
        </div>
        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-slate-600 dark:text-slate-400">Итого нарисовано</span>
          <b className="tabular-nums text-slate-900 dark:text-slate-100">{sums.total.toFixed(1)} м²</b>
        </div>
        {hasFloorArea && (
          <div className={`flex items-center justify-between text-xs ${overflow ? "text-red-600 dark:text-red-400" : tightFit ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
            <span>{overflow ? "Превышение" : "Свободно (стены/Δ)"}</span>
            <b className="tabular-nums">
              {overflow
                ? `+${(sums.total - totalArea).toFixed(1)} м²`
                : `${(remaining ?? 0).toFixed(1)} м²`}
            </b>
          </div>
        )}
      </div>

      {/* Visual progress bar against floor.totalArea */}
      {hasFloorArea && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pctRentable}%` }} />
            <div className="h-full bg-slate-400 transition-all" style={{ width: `${pctCommon}%` }} />
            {overflow && <div className="h-full bg-red-500" style={{ width: `${pctOver}%` }} />}
          </div>
          {overflow && (
            <p className="text-[10px] text-red-600 dark:text-red-400">
              ⚠ Сумма помещений превышает общую площадь этажа. Уменьшите размеры или увеличьте «общую площадь».
            </p>
          )}
          {!overflow && tightFit && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Почти заполнено. Учтите, что стены и конструкции занимают ~3–5% от общей площади.
            </p>
          )}
        </div>
      )}

      {/* Canvas size — менее заметно, для подгонки рабочей области */}
      <details className="group">
        <summary className="text-[10px] text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
          ▸ Размер холста для редактирования
        </summary>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="block text-[10px] text-slate-400 dark:text-slate-500 mb-1">Длина (м)</label>
            <input
              type="number"
              min="5"
              max="200"
              step="0.5"
              value={layout.width}
              onChange={(e) => setLayout((p) => ({ ...p, width: parseFloat(e.target.value) || 30 }))}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 dark:text-slate-500 mb-1">Ширина (м)</label>
            <input
              type="number"
              min="5"
              max="200"
              step="0.5"
              value={layout.height}
              onChange={(e) => setLayout((p) => ({ ...p, height: parseFloat(e.target.value) || 20 }))}
              className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1 text-xs"
            />
          </div>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          Рабочая область, в которую помещаются нарисованные зоны (не путать с площадью этажа).
        </p>
      </details>
    </div>
  )
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
