// Лист фасада или разреза: проекция из elevation.ts, отметки уровней по ГОСТ
// 21.101 (треугольник с полкой), вертикальная цепочка высот этажей, земля.

import type { ElevationDrawing, EItem } from "@/lib/builder/drawing/elevation"
import type { Sheet } from "@/lib/builder/drawing/floor-drawing"
import { STAMP } from "@/lib/builder/drawing/floor-drawing"

const SCALES = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500]
/** поля под цепочку высот слева и отметки справа, мм листа */
const LEFT = 42, RIGHT = 38, TOP = 26

export function pickElevationSheet(d: ElevationDrawing): Sheet {
  const w = d.bounds.maxU - d.bounds.minU
  const h = d.bounds.maxZ - d.bounds.minZ
  const options: Array<Omit<Sheet, "scale">> = [
    { w: 420, h: 297, format: "A3", orientation: "landscape" },
    { w: 594, h: 420, format: "A2", orientation: "landscape" },
  ]
  const fits = (o: Omit<Sheet, "scale">, s: number) => w / s + LEFT + RIGHT <= o.w - 25 && h / s + TOP + 12 <= o.h - 10 - STAMP.h
  for (const s of SCALES.filter((x) => x <= 200)) if (fits(options[0], s)) return { ...options[0], scale: s }
  for (const s of SCALES) if (fits(options[1], s)) return { ...options[1], scale: s }
  return { ...options[1], scale: 500 }
}

const STROKE: Record<string, number> = { thin: 0.18, main: 0.35, thick: 0.7 }

function fillOf(it: Extract<EItem, { t: "poly" }>): { fill: string; stroke: string; sw: number } {
  switch (it.fill) {
    case "cut": return { fill: "#111", stroke: "#111", sw: 0.1 }
    case "slab": return { fill: "#6b7280", stroke: "#111", sw: 0.25 }
    case "glass": return { fill: "#e6edf5", stroke: "#000", sw: 0.25 }
    case "opening": return { fill: "#fff", stroke: "#000", sw: 0.25 }
    case "roof": return { fill: "#f1f2f4", stroke: "none", sw: 0 }
    case "porch": return { fill: "#fff", stroke: "#000", sw: 0.3 }
    default: return { fill: "#fff", stroke: "none", sw: 0 } // контур грани — линиями, без швов
  }
}

export function ElevationSvgBody({ d, sheet, title }: { d: ElevationDrawing; sheet: Sheet; title: string }) {
  const { w, h, scale } = sheet
  const dw = (d.bounds.maxU - d.bounds.minU) / scale
  const dh = (d.bounds.maxZ - d.bounds.minZ) / scale
  const areaX0 = 20 + LEFT, areaX1 = w - 5 - RIGHT
  const areaY0 = 5 + TOP, areaY1 = h - 5 - STAMP.h - 12
  const ox = areaX0 + (areaX1 - areaX0 - dw) / 2
  const oy = areaY0 + (areaY1 - areaY0 - dh) / 2
  const X = (u: number) => ox + (u - d.bounds.minU) / scale
  const Y = (z: number) => oy + (d.bounds.maxZ - z) / scale
  const right = X(d.bounds.maxU)
  const left = X(d.bounds.minU)

  return (
    <g>
      {d.items.map((it, i) => {
        if (it.t === "line") {
          return <line key={i} x1={X(it.a.x)} y1={Y(it.a.y)} x2={X(it.b.x)} y2={Y(it.b.y)} stroke="#000" strokeWidth={STROKE[it.weight]} strokeLinecap="round" />
        }
        const f = fillOf(it)
        return <polygon key={i} points={it.pts.map((p) => `${X(p.x).toFixed(2)},${Y(p.y).toFixed(2)}`).join(" ")} fill={f.fill} stroke={f.stroke} strokeWidth={f.sw} strokeLinejoin="round" />
      })}

      {/* отметки уровней справа: выноска, треугольник, полка с числом */}
      {d.marks.map((m, i) => {
        const y = Y(m.z)
        const x = right + 6 + (i % 2) * 0 // одна колонка; близкие отметки разносятся текстом
        const prev = d.marks[i - 1]
        const tooClose = prev && Math.abs(Y(prev.z) - y) < 4
        return (
          <g key={`m${i}`} stroke="#000" strokeWidth={0.18} fill="none">
            <line x1={right + 1} y1={y} x2={x + 2} y2={y} strokeDasharray="1.5 1" />
            <polyline points={`${x - 1.5},${y - 1.5} ${x},${y} ${x + 1.5},${y - 1.5} ${x - 1.5},${y - 1.5}`} />
            <line x1={x} y1={y} x2={x} y2={y - (tooClose ? 6.5 : 4)} />
            <line x1={x} y1={y - (tooClose ? 6.5 : 4)} x2={x + 17} y2={y - (tooClose ? 6.5 : 4)} />
            <text x={x + 1} y={y - (tooClose ? 7.2 : 4.7)} fontSize={2.5} fill="#000" stroke="none">{m.text}</text>
          </g>
        )
      })}

      {/* цепочка высот этажей слева */}
      {d.dims.map((dim, i) => {
        const x = left - 12
        const y0 = Y(dim.z0), y1 = Y(dim.z1)
        const mid = (y0 + y1) / 2
        return (
          <g key={`d${i}`} stroke="#000" strokeWidth={0.13}>
            <line x1={x} y1={y0} x2={x} y2={y1} />
            <line x1={x - 2} y1={y0} x2={left - 1} y2={y0} />
            <line x1={x - 2} y1={y1} x2={left - 1} y2={y1} />
            {[y0, y1].map((y, j) => <line key={j} x1={x - 1} y1={y + 1} x2={x + 1} y2={y - 1} strokeWidth={0.35} />)}
            <text x={x - 1} y={mid} fontSize={2.5} textAnchor="middle" stroke="none" transform={`rotate(-90 ${x - 1} ${mid})`}>{dim.text}</text>
          </g>
        )
      })}
      {d.floorNames.map((n, i) => (
        <text key={`n${i}`} x={left - 22} y={Y(n.z)} fontSize={2.5} textAnchor="middle" transform={`rotate(-90 ${left - 22} ${Y(n.z)})`}>{n.text}</text>
      ))}

      {/* оси здания снизу: штрихпунктир и кружок с маркой — как на плане */}
      {(d.axes ?? []).map((ax, i) => {
        const x = X(ax.u)
        // кружок ставим ниже всего чертежа (на разрезе есть цоколь ниже нуля),
        // но не заезжая на штамп
        const y0 = Y(Math.min(0, d.bounds.minZ))
        const y1 = Math.min(y0 + 14, areaY1 + 6)
        return (
          <g key={`ax${i}`}>
            <line x1={x} y1={Y(d.bounds.maxZ)} x2={x} y2={y1 - 4} stroke="#555" strokeWidth={0.18} strokeDasharray="8 1.5 1 1.5" />
            <circle cx={x} cy={y1} r={4} fill="#fff" stroke="#000" strokeWidth={0.25} />
            <text x={x} y={y1 + 1.2} fontSize={3} textAnchor="middle">{ax.label}</text>
          </g>
        )
      })}

      <text x={(areaX0 + areaX1) / 2} y={Math.max(14, Y(d.bounds.maxZ) - 10)} fontSize={5} textAnchor="middle">
        {/* по ГОСТ фасад называют по крайним осям: «Фасад 1—2» */}
        {title}
        {(d.axes?.length ?? 0) >= 2 ? ` в осях ${d.axes[0].label}—${d.axes[d.axes.length - 1].label}` : ""}
        {"  "}
        <tspan fontSize={3.5}>М 1:{scale}</tspan>
      </text>
    </g>
  )
}
