"use client"

import { memo, type MouseEvent as ReactMouseEvent } from "react"
import {
  type FloorElement,
  elementCenter,
  polygonArea,
} from "@/lib/floor-layout"

export type FloorEditorSpaceLite = { id: string; number: string; status: string }

const PX_PER_METER = 40

const STATUS_FILL: Record<string, string> = {
  VACANT: "#dcfce7",
  OCCUPIED: "#dbeafe",
  MAINTENANCE: "#fef3c7",
  UNLINKED: "#f8fafc",
}

const STATUS_STROKE: Record<string, string> = {
  VACANT: "#10b981",
  OCCUPIED: "#3b82f6",
  MAINTENANCE: "#f59e0b",
  UNLINKED: "#cbd5e1",
}

type RenderElementProps = {
  el: FloorElement
  selected: boolean
  zoom: number
  spaceById: Map<string, FloorEditorSpaceLite>
  outlineOnly?: boolean
  onMoveStart: (event: ReactMouseEvent, element: FloorElement) => void
  onRectResizeStart: (event: ReactMouseEvent, element: FloorElement, handle: string) => void
  onPolyResizeStart: (event: ReactMouseEvent, element: FloorElement, vertexIndex: number) => void
}

export const RenderElement = memo(function RenderElement({
  el,
  selected,
  zoom,
  spaceById,
  outlineOnly,
  onMoveStart,
  onRectResizeStart,
  onPolyResizeStart,
}: RenderElementProps) {
  const linkedSpace = "spaceId" in el && el.spaceId
    ? spaceById.get(el.spaceId)
    : undefined
  const isCommon = (el.type === "rect" || el.type === "polygon") && el.kind === "common"
  const status = linkedSpace?.status ?? (isCommon ? "COMMON" : "UNLINKED")
  const commonFill = "#f1f5f9"
  const commonStroke = "#94a3b8"
  const fill = outlineOnly ? "transparent"
    : isCommon ? commonFill
    : (STATUS_FILL[status] ?? STATUS_FILL.UNLINKED)
  const stroke = selected ? "#3b82f6"
    : isCommon ? commonStroke
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
      <g onMouseDown={(event) => onMoveStart(event, el)} style={{ cursor: "move" }}>
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

        {selected && handles.map((handle) => (
          <rect
            key={handle.id}
            x={handle.x * PX_PER_METER - 5 / zoom}
            y={handle.y * PX_PER_METER - 5 / zoom}
            width={10 / zoom}
            height={10 / zoom}
            fill="white"
            stroke="#3b82f6"
            strokeWidth={1.5 / zoom}
            style={{ cursor: handle.cursor }}
            onMouseDown={(event) => onRectResizeStart(event, el, handle.id)}
          />
        ))}
      </g>
    )
  }

  if (el.type === "polygon") {
    const center = elementCenter(el)
    const points = el.points.map((point) => `${point.x * PX_PER_METER},${point.y * PX_PER_METER}`).join(" ")
    const area = polygonArea(el.points)

    return (
      <g onMouseDown={(event) => onMoveStart(event, el)} style={{ cursor: "move" }}>
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

        {selected && el.points.map((point, index) => (
          <circle
            key={index}
            cx={point.x * PX_PER_METER}
            cy={point.y * PX_PER_METER}
            r={6 / zoom}
            fill="white"
            stroke="#3b82f6"
            strokeWidth={1.5 / zoom}
            style={{ cursor: "move" }}
            onMouseDown={(event) => onPolyResizeStart(event, el, index)}
          />
        ))}
      </g>
    )
  }

  if (el.type === "door") {
    const cx = el.x * PX_PER_METER
    const cy = el.y * PX_PER_METER
    const width = el.width * PX_PER_METER

    return (
      <g onMouseDown={(event) => onMoveStart(event, el)} transform={`rotate(${el.rotation} ${cx} ${cy})`} style={{ cursor: "move" }}>
        <line x1={cx - width / 2} y1={cy} x2={cx + width / 2} y2={cy} stroke="#475569" strokeWidth={3 / zoom} />
        <path
          d={el.swing === "right"
            ? `M ${cx + width / 2} ${cy} A ${width} ${width} 0 0 0 ${cx + width / 2 - width} ${cy + width}`
            : `M ${cx - width / 2} ${cy} A ${width} ${width} 0 0 1 ${cx - width / 2 + width} ${cy + width}`}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1 / zoom}
          strokeDasharray={`${3 / zoom} ${3 / zoom}`}
        />
        {selected && (
          <rect
            x={cx - width / 2 - 4 / zoom}
            y={cy - 4 / zoom}
            width={width + 8 / zoom}
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
      <g onMouseDown={(event) => onMoveStart(event, el)} style={{ cursor: "move" }}>
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
      <g onMouseDown={(event) => onMoveStart(event, el)} style={{ cursor: "move" }}>
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
    const width = el.width * PX_PER_METER

    return (
      <g onMouseDown={(event) => onMoveStart(event, el)} transform={`rotate(${el.rotation} ${cx} ${cy})`} style={{ cursor: "move" }}>
        <rect
          x={cx - width / 2}
          y={cy - 3 / zoom}
          width={width}
          height={6 / zoom}
          fill="#dbeafe"
          stroke={selected ? "#3b82f6" : "#60a5fa"}
          strokeWidth={1.5 / zoom}
        />
        <line
          x1={cx - width / 2}
          y1={cy}
          x2={cx + width / 2}
          y2={cy}
          stroke="#3b82f6"
          strokeWidth={1 / zoom}
        />
      </g>
    )
  }

  if (el.type === "icon") {
    const size = el.size * PX_PER_METER
    const x = el.x * PX_PER_METER
    const y = el.y * PX_PER_METER
    const colors: Record<string, { bg: string; border: string; fg: string }> = {
      stairs: { bg: "#fef3c7", border: "#f59e0b", fg: "#92400e" },
      elevator: { bg: "#ede9fe", border: "#8b5cf6", fg: "#5b21b6" },
      toilet: { bg: "#dbeafe", border: "#3b82f6", fg: "#1e40af" },
      kitchen: { bg: "#dcfce7", border: "#10b981", fg: "#065f46" },
      parking: { bg: "#f1f5f9", border: "#64748b", fg: "#334155" },
    }
    const color = colors[el.kind] ?? colors.parking
    const symbol: Record<string, string> = {
      stairs: "|||",
      elevator: "^v",
      toilet: "WC",
      kitchen: "K",
      parking: "P",
    }

    return (
      <g onMouseDown={(event) => onMoveStart(event, el)} style={{ cursor: "move" }}>
        <rect
          x={x - size / 2}
          y={y - size / 2}
          width={size}
          height={size}
          fill={color.bg}
          stroke={selected ? "#3b82f6" : color.border}
          strokeWidth={(selected ? 2 : 1.5) / zoom}
          rx={4 / zoom}
        />
        <text
          x={x}
          y={y - 4 / zoom}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.min(size * 0.4, 24 / zoom)}
          fontWeight="bold"
          fill={color.fg}
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {symbol[el.kind] ?? el.kind}
        </text>
        {el.label && (
          <text
            x={x}
            y={y + size / 2 - 4 / zoom}
            textAnchor="middle"
            fontSize={10 / zoom}
            fill={color.fg}
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
}, areRenderElementPropsEqual)

function areRenderElementPropsEqual(prev: RenderElementProps, next: RenderElementProps) {
  return prev.el === next.el
    && prev.selected === next.selected
    && prev.zoom === next.zoom
    && prev.outlineOnly === next.outlineOnly
    && prev.spaceById === next.spaceById
    && prev.onMoveStart === next.onMoveStart
    && prev.onRectResizeStart === next.onRectResizeStart
    && prev.onPolyResizeStart === next.onPolyResizeStart
}
