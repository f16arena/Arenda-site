"use client"

import { useState, useRef, useCallback, MouseEvent as ReactMouseEvent } from "react"
import Link from "next/link"
import { X, ZoomIn, ZoomOut, Move } from "lucide-react"
import {
  type FloorLayoutV2,
  type FloorElement,
  elementCenter,
  polygonArea,
} from "@/lib/floor-layout"

const PX_PER_METER = 40

export type SpaceInfo = {
  id: string
  number: string
  area: number
  status: string
  description: string | null
  tenant?: {
    id: string
    companyName: string
    debt: number
    contractEnd: Date | null
  } | null
}

const STATUS_FILL: Record<string, string> = {
  VACANT: "#dcfce7",
  OCCUPIED: "#dbeafe",
  MAINTENANCE: "#fef3c7",
  UNLINKED: "#f8fafc",
  DEBT: "#fef3c7",       // долг
  OVERDUE: "#fee2e2",    // просрочка
}
const STATUS_STROKE: Record<string, string> = {
  VACANT: "#10b981",
  OCCUPIED: "#3b82f6",
  MAINTENANCE: "#f59e0b",
  UNLINKED: "#cbd5e1",
  DEBT: "#f59e0b",
  OVERDUE: "#ef4444",
}

function detectStatus(space: SpaceInfo | undefined): string {
  if (!space) return "UNLINKED"
  if (space.status === "MAINTENANCE") return "MAINTENANCE"
  if (space.tenant && space.tenant.debt > 0) {
    const due = space.tenant.contractEnd ? new Date(space.tenant.contractEnd) : null
    if (due && due < new Date()) return "OVERDUE"
    return "DEBT"
  }
  return space.status
}

export function FloorView({
  layout,
  spaces,
  floorId,
}: {
  layout: FloorLayoutV2
  spaces: SpaceInfo[]
  floorId: string
}) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [selected, setSelected] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null)

  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button === 1 || e.shiftKey) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, startPan: { ...pan } }
    } else {
      // клик в пустое — снять выделение
      const target = e.target as Element
      if (target === svgRef.current || target.tagName === "rect" && target.getAttribute("data-bg") === "1") {
        setSelected(null)
      }
    }
  }

  const onMouseMove = (e: ReactMouseEvent) => {
    if (!dragRef.current) return
    setPan({
      x: dragRef.current.startPan.x + (e.clientX - dragRef.current.startX),
      y: dragRef.current.startPan.y + (e.clientY - dragRef.current.startY),
    })
  }

  const onMouseUp = () => {
    dragRef.current = null
  }

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom((z) => Math.max(0.3, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))))
  }, [])

  const selectedEl = layout.elements.find((e) => e.id === selected)
  const selectedSpace = selectedEl && "spaceId" in selectedEl && selectedEl.spaceId
    ? spaces.find((s) => s.id === selectedEl.spaceId)
    : null

  return (
    <div className="relative bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden h-[500px]">
      <svg
        ref={svgRef}
        className="w-full h-full"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          <rect
            data-bg="1"
            x={0}
            y={0}
            width={layout.width * PX_PER_METER}
            height={layout.height * PX_PER_METER}
            fill="white"
            stroke="#e2e8f0"
            strokeWidth={1 / zoom}
          />

          {layout.elements.map((el) => (
            <ViewElement
              key={el.id}
              el={el}
              spaces={spaces}
              selected={selected === el.id}
              zoom={zoom}
              onClick={() => {
                if ("spaceId" in el && el.spaceId) {
                  setSelected(el.id)
                }
              }}
            />
          ))}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm p-1 flex flex-col gap-0.5">
        <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded">
          <ZoomIn className="h-4 w-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded">
          <ZoomOut className="h-4 w-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" />
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded">
          <Move className="h-4 w-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white dark:bg-slate-900/90 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: STATUS_FILL.VACANT, border: `1px solid ${STATUS_STROKE.VACANT}` }} /> Свободно</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: STATUS_FILL.OCCUPIED, border: `1px solid ${STATUS_STROKE.OCCUPIED}` }} /> Занято</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: STATUS_FILL.DEBT, border: `1px solid ${STATUS_STROKE.DEBT}` }} /> Долг</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: STATUS_FILL.OVERDUE, border: `1px solid ${STATUS_STROKE.OVERDUE}` }} /> Просрочка</div>
      </div>

      {/* Edit link */}
      <Link
        href={`/admin/floors/${floorId}`}
        className="absolute top-3 left-3 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white"
      >
        Редактировать план
      </Link>

      {/* Popup */}
      {selectedSpace && selectedEl && (
        <div className="absolute right-3 bottom-3 w-72 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Каб. {selectedSpace.number}</p>
            <button onClick={() => setSelected(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Площадь:</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">{selectedSpace.area} м²</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Статус:</span>
              <span className="font-medium">{detectStatus(selectedSpace)}</span>
            </div>
            {selectedSpace.tenant ? (
              <>
                <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Арендатор</p>
                  <Link href={`/admin/tenants/${selectedSpace.tenant.id}`} className="text-blue-600 hover:underline font-medium">
                    {selectedSpace.tenant.companyName}
                  </Link>
                </div>
                {selectedSpace.tenant.contractEnd && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Договор до:</span>
                    <span>{new Date(selectedSpace.tenant.contractEnd).toLocaleDateString("ru-RU")}</span>
                  </div>
                )}
                {selectedSpace.tenant.debt > 0 ? (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Долг:</span>
                    <span className="font-bold text-red-600">{selectedSpace.tenant.debt.toLocaleString("ru-RU")} ₸</span>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-600">Без задолженности</p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic border-t border-slate-100 dark:border-slate-800 pt-2">Помещение свободно</p>
            )}
            {selectedSpace.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 italic border-t border-slate-100 dark:border-slate-800 pt-2">{selectedSpace.description}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ViewElement({
  el, spaces, selected, zoom, onClick,
}: {
  el: FloorElement
  spaces: SpaceInfo[]
  selected: boolean
  zoom: number
  onClick: () => void
}) {
  const space = "spaceId" in el && el.spaceId ? spaces.find((s) => s.id === el.spaceId) : undefined
  const status = detectStatus(space)
  const fill = STATUS_FILL[status]
  const stroke = selected ? "#3b82f6" : STATUS_STROKE[status]
  const strokeWidth = selected ? 3 / zoom : 1.5 / zoom
  const clickable = !!space

  if (el.type === "rect") {
    const center = elementCenter(el)
    return (
      <g onClick={onClick} style={{ cursor: clickable ? "pointer" : "default" }}>
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
          {space ? `Каб. ${space.number}` : (el.label || "")}
        </text>
        {space && (
          <text
            x={center.x * PX_PER_METER}
            y={center.y * PX_PER_METER + 16 / zoom}
            textAnchor="middle"
            fontSize={10 / zoom}
            fill="#64748b"
            pointerEvents="none"
            style={{ userSelect: "none" }}
          >
            {space.area} м²
          </text>
        )}
      </g>
    )
  }

  if (el.type === "polygon") {
    const center = elementCenter(el)
    const points = el.points.map((p) => `${p.x * PX_PER_METER},${p.y * PX_PER_METER}`).join(" ")
    return (
      <g onClick={onClick} style={{ cursor: clickable ? "pointer" : "default" }}>
        <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
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
          {space ? `Каб. ${space.number}` : (el.label || "")}
        </text>
      </g>
    )
  }

  if (el.type === "door") {
    const cx = el.x * PX_PER_METER
    const cy = el.y * PX_PER_METER
    const w = el.width * PX_PER_METER
    return (
      <g transform={`rotate(${el.rotation} ${cx} ${cy})`} pointerEvents="none">
        <line x1={cx - w / 2} y1={cy} x2={cx + w / 2} y2={cy} stroke="#475569" strokeWidth={3 / zoom} />
        <path
          d={el.swing === "right"
            ? `M ${cx + w / 2} ${cy} A ${w} ${w} 0 0 0 ${cx + w / 2 - w} ${cy + w}`
            : `M ${cx - w / 2} ${cy} A ${w} ${w} 0 0 1 ${cx - w / 2 + w} ${cy + w}`}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1 / zoom}
          strokeDasharray={`${3 / zoom} ${3 / zoom}`}
        />
      </g>
    )
  }

  if (el.type === "label") {
    return (
      <text
        x={el.x * PX_PER_METER}
        y={el.y * PX_PER_METER}
        fontSize={(el.fontSize ?? 0.5) * PX_PER_METER}
        fill="#475569"
        fontWeight={500}
        pointerEvents="none"
        style={{ userSelect: "none" }}
      >
        {el.text}
      </text>
    )
  }

  if (el.type === "wall") {
    const thickness = (el.thickness ?? 0.15) * PX_PER_METER
    return (
      <line
        x1={el.x1 * PX_PER_METER}
        y1={el.y1 * PX_PER_METER}
        x2={el.x2 * PX_PER_METER}
        y2={el.y2 * PX_PER_METER}
        stroke="#475569"
        strokeWidth={thickness}
        strokeLinecap="round"
        pointerEvents="none"
      />
    )
  }

  if (el.type === "window") {
    const cx = el.x * PX_PER_METER
    const cy = el.y * PX_PER_METER
    const w = el.width * PX_PER_METER
    return (
      <g transform={`rotate(${el.rotation} ${cx} ${cy})`} pointerEvents="none">
        <rect x={cx - w / 2} y={cy - 3 / zoom} width={w} height={6 / zoom} fill="#dbeafe" stroke="#60a5fa" strokeWidth={1.5 / zoom} />
        <line x1={cx - w / 2} y1={cy} x2={cx + w / 2} y2={cy} stroke="#3b82f6" strokeWidth={1 / zoom} />
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
      <g pointerEvents="none">
        <rect x={x - s / 2} y={y - s / 2} width={s} height={s} fill={c.bg} stroke={c.border} strokeWidth={1.5 / zoom} rx={4 / zoom} />
        <text x={x} y={y - 4 / zoom} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(s * 0.4, 24 / zoom)} fontWeight="bold" fill={c.fg} style={{ userSelect: "none" }}>
          {symbol[el.kind] ?? el.kind}
        </text>
        {el.label && (
          <text x={x} y={y + s / 2 - 4 / zoom} textAnchor="middle" fontSize={10 / zoom} fill={c.fg} style={{ userSelect: "none" }}>{el.label}</text>
        )}
      </g>
    )
  }

  return null
}
