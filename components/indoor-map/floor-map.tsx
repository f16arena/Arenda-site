"use client"

// Плоский план этажа. Рисуется в метрах внутри масштабируемой группы, поэтому
// толщина линий задаётся в пикселях через vector-effect и не толстеет при зуме
// (SPEC §3). Подписи — HTML-оверлеем поверх SVG, не текстурой и не <text>:
// так они остаются резкими и живут по шрифту продукта.

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import type { FloorLayoutV2 } from "@/lib/floor-layout"
import { layoutBox, polygonPath } from "@/lib/indoor-map/geometry"
import { fontSizeFor, layoutLabels } from "@/lib/indoor-map/labels"
import type { FloorView, RoomView } from "@/lib/indoor-map/model"
import { PAPER, STATUS_STYLE, STROKE, ZOOM_MAX, ZOOM_MIN, detailFor } from "@/lib/indoor-map/tokens"
import { CategoryGlyph, ServiceGlyph, type ServiceKind } from "./glyphs"

export type MapFilter = "all" | "vacant" | "expiring" | "debt"

type Camera = { cx: number; cy: number; zoom: number }

/** Императивные команды карты: поиск подводит камеру, кнопка возвращает обзор. */
export type FloorMapHandle = {
  focus: (room: RoomView) => void
  fit: () => void
  exportPng: (fileName: string) => Promise<void>
}

type Props = {
  layout: FloorLayoutV2
  view: FloorView
  filter: MapFilter
  selectedRoomId: string | null
  onSelect: (room: RoomView | null) => void
  ref?: React.Ref<FloorMapHandle>
}

function matchesFilter(room: RoomView, filter: MapFilter): boolean {
  if (room.status === "COMMON") return true
  if (filter === "all") return true
  if (filter === "vacant") return room.status === "VACANT"
  if (filter === "debt") return room.debt > 0
  return room.status === "EXPIRING"
}

export function FloorMap({ layout, view, filter, selectedRoomId, onSelect, ref }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 900, h: 600 })
  const [camera, setCamera] = useState<Camera | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

  const box = useMemo(() => layoutBox(layout), [layout])

  // Кадр «вписать» не хранится в состоянии, а выводится из габаритов и размера
  // окна: пока пользователь не двигал карту сам, показываем именно его.
  const fitted = useMemo<Camera>(() => {
    const padding = 48
    const w = Math.max(box.maxX - box.minX, 1)
    const h = Math.max(box.maxY - box.minY, 1)
    const zoom = Math.min((size.w - padding * 2) / w, (size.h - padding * 2) / h)
    return {
      cx: (box.minX + box.maxX) / 2,
      cy: (box.minY + box.maxY) / 2,
      zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom)),
    }
  }, [box, size.w, size.h])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) setSize({ w: rect.width, h: rect.height })
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const cam = camera ?? fitted
  const tx = size.w / 2 - cam.cx * cam.zoom
  const ty = size.h / 2 - cam.cy * cam.zoom
  const detail = detailFor(cam.zoom)

  const project = useCallback(
    (p: { x: number; y: number }) => ({ x: p.x * cam.zoom + tx, y: p.y * cam.zoom + ty }),
    [cam.zoom, tx, ty],
  )

  const visibleRooms = useMemo(
    () => view.rooms.filter((r) => matchesFilter(r, filter)),
    [view.rooms, filter],
  )
  const labels = useMemo(
    () => layoutLabels(visibleRooms, { detail, pxPerMeter: cam.zoom, project }),
    [visibleRooms, detail, cam.zoom, project],
  )
  const roomById = useMemo(() => new Map(view.rooms.map((r) => [r.id, r])), [view.rooms])
  const fontSize = fontSizeFor(detail)

  const fit = useCallback(() => setCamera(null), [])

  /**
   * Выгрузка плана картинкой. Сам SVG растеризуется как есть, а подписи
   * дорисовываются на холст: они живут HTML-оверлеем и в SVG их нет.
   */
  const exportPng = useCallback(async function exportPng(fileName: string) {
    const svg = svgRef.current
    if (!svg) return
    const scale = 2
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], {
        type: "image/svg+xml;charset=utf-8",
      }),
    )
    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error("Не удалось отрисовать план"))
        image.src = url
      })
      const canvas = document.createElement("canvas")
      canvas.width = size.w * scale
      canvas.height = size.h * scale
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.scale(scale, scale)
      ctx.fillStyle = PAPER.ground
      ctx.fillRect(0, 0, size.w, size.h)
      ctx.drawImage(image, 0, 0, size.w, size.h)

      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      for (const label of labels) {
        if (label.mode === "icon") continue
        const room = roomById.get(label.roomId)
        if (!room) continue
        ctx.fillStyle = STATUS_STYLE[room.status].ink
        ctx.font = `600 ${fontSize}px Onest, system-ui, sans-serif`
        ctx.fillText(label.text, label.x, label.y)
        if (label.withArea) {
          ctx.font = `500 ${fontSize - 2.5}px Onest, system-ui, sans-serif`
          ctx.globalAlpha = 0.7
          ctx.fillText(
            `${room.number ? `${room.number} · ` : ""}${room.area.toFixed(0)} м²`,
            label.x,
            label.y + fontSize * 0.95,
          )
          ctx.globalAlpha = 1
        }
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!blob) return
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      link.click()
      URL.revokeObjectURL(link.href)
    } finally {
      URL.revokeObjectURL(url)
    }
  }, [size.w, size.h, labels, roomById, fontSize])

  useImperativeHandle(
    ref,
    () => ({
      fit,
      exportPng,
      focus: (room: RoomView) =>
        setCamera((prev) => ({
          cx: room.anchor.x,
          cy: room.anchor.y,
          zoom: Math.max(prev?.zoom ?? fitted.zoom, 22),
        })),
    }),
    [fit, fitted.zoom, exportPng],
  )

  function handleWheel(event: React.WheelEvent) {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    const factor = Math.exp(-event.deltaY * 0.0015)
    const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom * factor))
    // точка под курсором остаётся на месте
    const mx = (px - tx) / cam.zoom
    const my = (py - ty) / cam.zoom
    setCamera({
      zoom,
      cx: mx - (px - size.w / 2) / zoom,
      cy: my - (py - size.h / 2) / zoom,
    })
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return
    dragRef.current = { x: event.clientX, y: event.clientY, cx: cam.cx, cy: cam.cy }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    setCamera({
      zoom: cam.zoom,
      cx: drag.cx - (event.clientX - drag.x) / cam.zoom,
      cy: drag.cy - (event.clientY - drag.y) / cam.zoom,
    })
  }

  function handlePointerUp(event: React.PointerEvent) {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    // Клик без протяжки по пустому месту снимает выделение
    if (drag && Math.abs(event.clientX - drag.x) < 3 && Math.abs(event.clientY - drag.y) < 3) {
      onSelect(null)
    }
  }

  const hovered = hoveredId ? (roomById.get(hoveredId) ?? null) : null

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
      style={{ background: PAPER.ground, cursor: dragging ? "grabbing" : "grab" }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        dragRef.current = null
        setDragging(false)
        setHoveredId(null)
      }}
    >
      <svg ref={svgRef} width={size.w} height={size.h} className="block">
        <g transform={`translate(${tx} ${ty}) scale(${cam.zoom})`}>
          {/* плита этажа */}
          <rect
            x={box.minX - 0.6}
            y={box.minY - 0.6}
            width={box.maxX - box.minX + 1.2}
            height={box.maxY - box.minY + 1.2}
            rx={0.8}
            fill={PAPER.plate}
            stroke={PAPER.outline}
            strokeWidth={STROKE.common}
            vectorEffect="non-scaling-stroke"
          />

          {/* общие зоны — всегда светлее арендных */}
          {view.rooms
            .filter((room) => room.status === "COMMON")
            .map((room) => (
              <path
                key={room.id}
                d={polygonPath(room.points)}
                fill={STATUS_STYLE.COMMON.fill}
                stroke={STATUS_STYLE.COMMON.edge}
                strokeWidth={STROKE.common}
                vectorEffect="non-scaling-stroke"
              />
            ))}

          {/* арендные помещения */}
          {view.rooms
            .filter((room) => room.status !== "COMMON")
            .map((room) => {
              const style = STATUS_STYLE[room.status]
              const dimmed = !matchesFilter(room, filter)
              const selected = room.id === selectedRoomId
              return (
                <path
                  key={room.id}
                  d={polygonPath(room.points)}
                  fill={dimmed ? "#f1f3f7" : style.fill}
                  stroke={dimmed ? "#dfe4ee" : style.edge}
                  strokeWidth={selected ? STROKE.roomSelected : STROKE.room}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: "pointer" }}
                  onPointerEnter={() => setHoveredId(room.id)}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(room)
                  }}
                />
              )
            })}

          {/* стены */}
          {layout.elements.map((el) =>
            el.type === "wall" ? (
              <line
                key={el.id}
                x1={el.x1}
                y1={el.y1}
                x2={el.x2}
                y2={el.y2}
                stroke={PAPER.wall}
                strokeWidth={STROKE.wall}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}

          {/* проёмы показываем только вблизи */}
          {detail === "near"
            ? layout.elements.map((el) => {
                if (el.type === "door") {
                  const half = (el.width || 0.9) / 2
                  const sweep = el.swing === "left" ? 1 : 0
                  return (
                    <g key={el.id} transform={`translate(${el.x} ${el.y}) rotate(${el.rotation})`}>
                      <line
                        x1={-half}
                        y1={0}
                        x2={half}
                        y2={0}
                        stroke={PAPER.opening}
                        strokeWidth={STROKE.wall + 2}
                        vectorEffect="non-scaling-stroke"
                      />
                      <path
                        d={`M ${-half} 0 A ${half * 2} ${half * 2} 0 0 ${sweep} ${half} 0`}
                        fill="none"
                        stroke={PAPER.glyphSoft}
                        strokeWidth={STROKE.hairline}
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  )
                }
                if (el.type === "window") {
                  const half = (el.width || 1.2) / 2
                  return (
                    <line
                      key={el.id}
                      x1={-half}
                      y1={0}
                      x2={half}
                      y2={0}
                      transform={`translate(${el.x} ${el.y}) rotate(${el.rotation})`}
                      stroke="#8fb4f5"
                      strokeWidth={STROKE.wall}
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                }
                return null
              })
            : null}
        </g>
      </svg>

      {/* служебные знаки — HTML, чтобы штрих не тянулся вместе с масштабом */}
      {detail !== "far"
        ? layout.elements.map((el) => {
            if (el.type !== "icon") return null
            const p = project({ x: el.x, y: el.y })
            return (
              <div
                key={el.id}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: p.x, top: p.y, color: PAPER.glyph }}
              >
                <ServiceGlyph kind={el.kind as ServiceKind} size={detail === "near" ? 20 : 16} />
              </div>
            )
          })
        : null}

      {/* долг: точка в углу помещения, видна независимо от подписи */}
      {detail !== "far"
        ? visibleRooms
            .filter((room) => room.debt > 0)
            .map((room) => {
              const corner = room.points.reduce(
                (best, point) =>
                  point.y - point.x < best.y - best.x ? { x: point.x, y: point.y } : best,
                room.points[0],
              )
              const p = project({ x: corner.x, y: corner.y })
              return (
                <span
                  key={`debt-${room.id}`}
                  title={`Долг ${Math.round(room.debt).toLocaleString("ru-RU")} ₸`}
                  className="pointer-events-none absolute h-[7px] w-[7px] rounded-full bg-red-500 ring-2 ring-white"
                  // угол правый верхний, поэтому уводим внутрь помещения: влево и вниз
                  style={{ left: p.x - 12, top: p.y + 8 }}
                />
              )
            })
        : null}

      {/* подписи */}
      {labels.map((label) => {
        const room = roomById.get(label.roomId)
        if (!room) return null
        const style = STATUS_STYLE[room.status]
        if (label.mode === "icon") {
          return (
            <div
              key={label.roomId}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md bg-white/85 p-1"
              style={{ left: label.x, top: label.y, color: style.ink }}
            >
              {room.category ? <CategoryGlyph category={room.category} size={14} /> : null}
            </div>
          )
        }
        return (
          <div
            key={label.roomId}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-center leading-tight"
            style={{ left: label.x, top: label.y, color: style.ink, width: label.width }}
          >
            <div className="flex items-center justify-center gap-1">
              {room.category && label.mode === "full" ? (
                <CategoryGlyph category={room.category} size={fontSize} />
              ) : null}
              <span className="truncate font-semibold" style={{ fontSize }}>
                {label.text}
              </span>
            </div>
            {label.withArea ? (
              <div className="font-medium opacity-70" style={{ fontSize: fontSize - 2.5 }}>
                {room.number ? `${room.number} · ` : ""}
                {room.area.toFixed(0)} м²
              </div>
            ) : null}
          </div>
        )
      })}

      {/* карточка при наведении */}
      {hovered && hovered.status !== "COMMON" ? (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[280px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: STATUS_STYLE[hovered.status].edge }}
            />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {STATUS_STYLE[hovered.status].label}
            </span>
          </div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900">{hovered.title}</div>
          <div className="text-xs text-slate-500">
            {hovered.number ? `Помещение ${hovered.number} · ` : ""}
            {hovered.area.toFixed(1)} м²
            {hovered.daysLeft !== null && hovered.daysLeft >= 0
              ? ` · договор ещё ${hovered.daysLeft} дн.`
              : ""}
          </div>
          {hovered.debt > 0 ? (
            <div className="mt-0.5 text-xs font-semibold text-red-600">
              Долг {Math.round(hovered.debt).toLocaleString("ru-RU")} ₸
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={fit}
        className="absolute bottom-3 right-3 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:text-slate-900"
      >
        Вписать
      </button>
    </div>
  )
}
