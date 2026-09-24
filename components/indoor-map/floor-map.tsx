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
import { useT } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"
import { CategoryGlyph, ServiceGlyph, type ServiceKind } from "./glyphs"

export type MapFilter = "all" | "vacant" | "expiring" | "debt"

/** Привязка редактора к карте: жесты отдаёт карта, состояние живёт снаружи. */
export type EditBinding = {
  tool: "select" | "rect" | "ruler"
  onSelectRoom: (roomId: string | null) => void
  /** отрезок калибровки: длина в метрах текущей системы координат */
  onMeasure?: (from: { x: number; y: number }, to: { x: number; y: number }) => void
  onMoveVertex: (roomId: string, index: number, to: { x: number; y: number }) => void
  onMoveRoom: (roomId: string, delta: { x: number; y: number }) => void
  onCreateRect: (from: { x: number; y: number }, to: { x: number; y: number }) => void
}

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
  edit?: EditBinding
  ref?: React.Ref<FloorMapHandle>
}

function matchesFilter(room: RoomView, filter: MapFilter): boolean {
  if (room.status === "COMMON") return true
  if (filter === "all") return true
  if (filter === "vacant") return room.status === "VACANT"
  if (filter === "debt") return room.debt > 0
  return room.status === "EXPIRING"
}

export function FloorMap({ layout, view, filter, selectedRoomId, onSelect, edit, ref }: Props) {
  const { t, locale } = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 900, h: 600 })
  const [camera, setCamera] = useState<Camera | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [rubber, setRubber] = useState<{
    from: { x: number; y: number }
    to: { x: number; y: number }
  } | null>(null)
  type Gesture =
    | { kind: "pan"; x: number; y: number; cx: number; cy: number }
    | { kind: "room"; roomId: string; from: { x: number; y: number } }
    | { kind: "vertex"; roomId: string; index: number }
    | { kind: "rect"; from: { x: number; y: number } }
    | { kind: "ruler"; from: { x: number; y: number } }
  const dragRef = useRef<Gesture | null>(null)

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

  const unproject = useCallback(
    (clientX: number, clientY: number) => {
      const rect = hostRef.current?.getBoundingClientRect()
      return {
        x: (clientX - (rect?.left ?? 0) - tx) / cam.zoom,
        y: (clientY - (rect?.top ?? 0) - ty) / cam.zoom,
      }
    },
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
        image.onerror = () => reject(new Error(t("adminObjects.map.renderFailed")))
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
        const lineHeight = fontSize * 1.25
        const top = label.y - ((label.lines.length - 1) * lineHeight) / 2
        label.lines.forEach((line, index) => {
          ctx.fillText(line, label.x, top + index * lineHeight)
        })
        if (label.withArea) {
          ctx.font = `500 ${fontSize - 2.5}px Onest, system-ui, sans-serif`
          ctx.globalAlpha = 0.7
          ctx.fillText(
            `${room.number ? `${room.number} · ` : ""}${room.area.toFixed(0)} м²`,
            label.x,
            top + label.lines.length * lineHeight,
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
  }, [size.w, size.h, labels, roomById, fontSize, t])

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
    event.currentTarget.setPointerCapture(event.pointerId)
    if (edit && (edit.tool === "rect" || edit.tool === "ruler")) {
      dragRef.current = {
        kind: edit.tool === "ruler" ? "ruler" : "rect",
        from: unproject(event.clientX, event.clientY),
      }
      return
    }
    dragRef.current = { kind: "pan", x: event.clientX, y: event.clientY, cx: cam.cx, cy: cam.cy }
    setDragging(true)
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    if (drag.kind === "pan") {
      setCamera({
        zoom: cam.zoom,
        cx: drag.cx - (event.clientX - drag.x) / cam.zoom,
        cy: drag.cy - (event.clientY - drag.y) / cam.zoom,
      })
      return
    }
    if (!edit) return
    const point = unproject(event.clientX, event.clientY)
    if (drag.kind === "rect" || drag.kind === "ruler") {
      setRubber({ from: drag.from, to: point })
      return
    }
    if (drag.kind === "vertex") {
      edit.onMoveVertex(drag.roomId, drag.index, point)
      return
    }
    // перетаскивание помещения: смещение считаем от точки, где взяли
    edit.onMoveRoom(drag.roomId, { x: point.x - drag.from.x, y: point.y - drag.from.y })
    dragRef.current = { ...drag, from: point }
  }

  function handlePointerUp(event: React.PointerEvent) {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (!drag) return
    if (drag.kind === "rect" || drag.kind === "ruler") {
      const to = unproject(event.clientX, event.clientY)
      setRubber(null)
      if (drag.kind === "ruler") edit?.onMeasure?.(drag.from, to)
      else edit?.onCreateRect(drag.from, to)
      return
    }
    // Клик без протяжки по пустому месту снимает выделение
    if (
      drag.kind === "pan" &&
      Math.abs(event.clientX - drag.x) < 3 &&
      Math.abs(event.clientY - drag.y) < 3
    ) {
      onSelect(null)
      edit?.onSelectRoom(null)
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
        setRubber(null)
        setHoveredId(null)
      }}
    >
      <svg ref={svgRef} width={size.w} height={size.h} className="block">
        <g transform={`translate(${tx} ${ty}) scale(${cam.zoom})`}>
          {/* подложка: скан плана под всей геометрией */}
          {layout.underlay ? (
            <image
              href={layout.underlay.url}
              x={layout.underlay.x}
              y={layout.underlay.y}
              width={layout.underlay.widthMeters}
              height={layout.underlay.widthMeters / (layout.underlay.aspect || 1)}
              opacity={layout.underlay.opacity ?? 0.55}
              preserveAspectRatio="none"
            />
          ) : null}

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
                  onPointerDown={(event) => {
                    if (!edit || edit.tool !== "select") return
                    event.stopPropagation()
                    hostRef.current?.setPointerCapture(event.pointerId)
                    edit.onSelectRoom(room.id)
                    onSelect(room)
                    dragRef.current = {
                      kind: "room",
                      roomId: room.id,
                      from: unproject(event.clientX, event.clientY),
                    }
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(room)
                    edit?.onSelectRoom(room.id)
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
          {/* линейка калибровки */}
          {rubber && edit?.tool === "ruler" ? (
            <line
              x1={rubber.from.x}
              y1={rubber.from.y}
              x2={rubber.to.x}
              y2={rubber.to.y}
              stroke={STATUS_STYLE.EXPIRING.edge}
              strokeWidth={2.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {/* рамка создаваемого помещения */}
          {rubber && edit?.tool === "rect" ? (
            <rect
              x={Math.min(rubber.from.x, rubber.to.x)}
              y={Math.min(rubber.from.y, rubber.to.y)}
              width={Math.abs(rubber.to.x - rubber.from.x)}
              height={Math.abs(rubber.to.y - rubber.from.y)}
              fill="rgba(31,84,214,.12)"
              stroke={STATUS_STYLE.OCCUPIED.edge}
              strokeWidth={STROKE.roomSelected}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </g>
      </svg>

      {/* ручки на углах выбранного помещения */}
      {edit && selectedRoomId
        ? (roomById.get(selectedRoomId)?.points ?? []).map((point, index) => {
            const p = project(point)
            return (
              <span
                key={`handle-${selectedRoomId}-${index}`}
                role="presentation"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  hostRef.current?.setPointerCapture(event.pointerId)
                  dragRef.current = { kind: "vertex", roomId: selectedRoomId, index }
                }}
                className="absolute h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-[2px] border-2 border-blue-600 bg-white shadow-sm"
                style={{ left: p.x, top: p.y }}
              />
            )
          })
        : null}

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
                  title={t("adminObjects.map.debtTitle", {
                    amount: formatMoneyL(locale, Math.round(room.debt)),
                  })}
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
              <span className="font-semibold" style={{ fontSize }}>
                {label.lines.map((line, index) => (
                  <span key={line + index} className="block">
                    {line}
                  </span>
                ))}
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
              {t(`adminObjects.map.status.${hovered.status}` as "adminObjects.map.status.VACANT")}
            </span>
          </div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900">{hovered.title}</div>
          <div className="text-xs text-slate-500">
            {hovered.number
              ? `${t("adminObjects.map.premiseNumber", { number: hovered.number })} · `
              : ""}
            {hovered.area.toFixed(1)} м²
            {hovered.daysLeft !== null && hovered.daysLeft >= 0
              ? ` · ${t("adminObjects.map.contractDaysLeft", { days: hovered.daysLeft })}`
              : ""}
          </div>
          {hovered.debt > 0 ? (
            <div className="mt-0.5 text-xs font-semibold text-red-600">
              {t("adminObjects.map.debtTitle", {
                amount: formatMoneyL(locale, Math.round(hovered.debt)),
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={fit}
        className="absolute bottom-3 right-3 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:text-slate-900"
      >
        {t("adminObjects.map.fitToScreen")}
      </button>
    </div>
  )
}
