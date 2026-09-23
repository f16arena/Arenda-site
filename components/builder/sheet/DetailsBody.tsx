// Лист «Узлы и фрагменты»: разрезы по типовым местам здания с штриховкой по
// ГОСТ 2.306, выносками-полками, размерами и составом слоёв под каждым узлом.

import type { Detail, DetailPattern } from "@/lib/builder/drawing/details"
import { useT } from "@/lib/i18n/client"

/** Стандартные масштабы узлов: подбираем ближайший, чтобы в штампе не было «1:13». */
const SCALES = [5, 10, 20, 25, 50]

function fitScale(bw: number, bh: number, cw: number, ch: number): number {
  const need = Math.max(bw / cw, bh / ch)
  return SCALES.find((s) => s >= need) ?? SCALES[SCALES.length - 1]
}

const PATTERN_FILL: Record<DetailPattern, string> = {
  concrete: "url(#d-concrete)",
  insulation: "url(#d-insulation)",
  brick: "url(#d-brick)",
  screed: "url(#d-screed)",
  soil: "url(#d-soil)",
  metal: "#111",
  glass: "url(#d-glass)",
  wood: "url(#d-wood)",
  membrane: "#222",
}

function Defs() {
  return (
    <defs>
      <pattern id="d-concrete" patternUnits="userSpaceOnUse" width={2.4} height={2.4} patternTransform="rotate(45)">
        <rect width={2.4} height={2.4} fill="#fff" />
        <line x1={0} y1={0} x2={0} y2={2.4} stroke="#000" strokeWidth={0.15} />
        <circle cx={1.2} cy={1.2} r={0.22} fill="#000" />
      </pattern>
      <pattern id="d-brick" patternUnits="userSpaceOnUse" width={2} height={2} patternTransform="rotate(45)">
        <rect width={2} height={2} fill="#fff" />
        <line x1={0} y1={0} x2={0} y2={2} stroke="#000" strokeWidth={0.15} />
      </pattern>
      <pattern id="d-screed" patternUnits="userSpaceOnUse" width={1.2} height={1.2} patternTransform="rotate(45)">
        <rect width={1.2} height={1.2} fill="#fff" />
        <line x1={0} y1={0} x2={0} y2={1.2} stroke="#000" strokeWidth={0.12} />
      </pattern>
      <pattern id="d-insulation" patternUnits="userSpaceOnUse" width={2.6} height={1.8}>
        <rect width={2.6} height={1.8} fill="#fff" />
        <path d="M0 1.4 q0.65 -1.4 1.3 0 q0.65 1.4 1.3 0" fill="none" stroke="#000" strokeWidth={0.14} />
      </pattern>
      <pattern id="d-soil" patternUnits="userSpaceOnUse" width={2.2} height={2.2}>
        <rect width={2.2} height={2.2} fill="#fff" />
        <circle cx={0.6} cy={0.7} r={0.16} fill="#000" />
        <circle cx={1.6} cy={1.6} r={0.12} fill="#000" />
      </pattern>
      <pattern id="d-glass" patternUnits="userSpaceOnUse" width={1.6} height={1.6} patternTransform="rotate(-45)">
        <rect width={1.6} height={1.6} fill="#fff" />
        <line x1={0} y1={0} x2={0} y2={1.6} stroke="#0f172a" strokeWidth={0.1} />
      </pattern>
      <pattern id="d-wood" patternUnits="userSpaceOnUse" width={2.4} height={1.2}>
        <rect width={2.4} height={1.2} fill="#fff" />
        <path d="M0 0.6 q0.6 -0.5 1.2 0 q0.6 0.5 1.2 0" fill="none" stroke="#000" strokeWidth={0.12} />
      </pattern>
    </defs>
  )
}

function DetailCell({ d, x, y, w, h }: { d: Detail; x: number; y: number; w: number; h: number }) {
  const { t } = useT()
  // поле чертежа внутри ячейки: сверху заголовок, снизу состав слоёв
  const headH = 7
  const layersH = Math.min(22, 3.6 * d.layers.length + 2)
  const drawH = h - headH - layersH
  // масштаб — по самой конструкции, а не по разлёту выносок: иначе узел рисуется
  // мелко (1:50), а по ГОСТ узлы дают в 1:10–1:20
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const sh of d.shapes) for (const p of sh.poly) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const bw = maxX - minX
  const bh = maxY - minY
  // запас 1,6 — под полки выносок и размерные линии вокруг конструкции
  const scale = fitScale(bw * 1.7, bh * 1.7, w, drawH)
  const cx = x + w / 2
  const cy = y + headH + drawH / 2
  const X = (mx: number) => cx + (mx - (minX + bw / 2)) / scale
  const Y = (my: number) => cy - (my - (minY + bh / 2)) / scale
  const P = (p: { x: number; y: number }) => `${X(p.x).toFixed(2)},${Y(p.y).toFixed(2)}`
  return (
    <g>
      <text x={cx} y={y + 4.4} fontSize={4} textAnchor="middle" fontWeight={600}>
        {t("adminBuilderSheet.sheet.detailScale", { mark: d.mark, title: d.title, scale })}
      </text>
      {d.shapes.map((s, i) => (
        <polygon
          key={`s${i}`}
          points={s.poly.map(P).join(" ")}
          fill={PATTERN_FILL[s.pattern]}
          stroke="#000"
          strokeWidth={s.bold ? 0.45 : 0.22}
        />
      ))}
      {d.lines.map((l, i) => (
        <line key={`l${i}`} x1={X(l.a.x)} y1={Y(l.a.y)} x2={X(l.b.x)} y2={Y(l.b.y)} stroke="#000" strokeWidth={l.bold ? 0.4 : 0.18} strokeDasharray={l.dash ? "2 1.2" : undefined} />
      ))}
      {d.dims.map((dim, i) => {
        // размерная линия со стрелками-засечками, как на чертеже
        const off = dim.offset / scale
        const a = dim.vertical ? { x: X(dim.a.x) + off, y: Y(dim.a.y) } : { x: X(dim.a.x), y: Y(dim.a.y) - off }
        const b = dim.vertical ? { x: X(dim.b.x) + off, y: Y(dim.b.y) } : { x: X(dim.b.x), y: Y(dim.b.y) - off }
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        return (
          <g key={`dim${i}`}>
            <line x1={X(dim.a.x)} y1={Y(dim.a.y)} x2={a.x} y2={a.y} stroke="#000" strokeWidth={0.12} />
            <line x1={X(dim.b.x)} y1={Y(dim.b.y)} x2={b.x} y2={b.y} stroke="#000" strokeWidth={0.12} />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#000" strokeWidth={0.18} />
            <text
              x={dim.vertical ? mx - 1 : mx}
              y={dim.vertical ? my : my - 1}
              fontSize={2.6}
              textAnchor="middle"
              transform={dim.vertical ? `rotate(-90 ${mx - 1} ${my})` : undefined}
            >
              {dim.text}
            </text>
          </g>
        )
      })}
      {d.notes.map((n, i) => {
        const tx = X(n.to.x)
        const ty = Y(n.to.y)
        const right = tx >= X(n.at.x)
        const shelf = right ? 12 : -12
        return (
          <g key={`n${i}`}>
            <line x1={X(n.at.x)} y1={Y(n.at.y)} x2={tx} y2={ty} stroke="#000" strokeWidth={0.15} />
            <line x1={tx} y1={ty} x2={tx + shelf} y2={ty} stroke="#000" strokeWidth={0.15} />
            <circle cx={X(n.at.x)} cy={Y(n.at.y)} r={0.35} fill="#000" />
            <text x={tx + shelf / 2} y={ty - 1.2} fontSize={2.5} textAnchor="middle">{n.text}</text>
          </g>
        )
      })}
      {d.layers.map((t, i) => (
        <text key={`ly${i}`} x={x + 2} y={y + headH + drawH + 4 + i * 3.4} fontSize={2.5}>{t}</text>
      ))}
    </g>
  )
}

export function DetailsBody({ details, w, h }: { details: Detail[]; w: number; h: number }) {
  const { t } = useT()
  const x0 = 26
  const y0 = 18
  const areaW = w - 60
  // нижний ряд не должен налезать на штамп в правом нижнем углу
  const areaH = h - 78
  const cols = details.length > 2 ? 2 : details.length || 1
  const rows = Math.ceil(details.length / cols)
  const cw = areaW / cols
  const ch = areaH / rows
  return (
    <g>
      <Defs />
      <text x={x0} y={y0 - 6} fontSize={5} fontWeight={600}>{t("adminBuilderSheet.sheet.detailsTitle")}</text>
      {details.map((d, i) => (
        <DetailCell
          key={d.id}
          d={d}
          x={x0 + (i % cols) * cw}
          y={y0 + Math.floor(i / cols) * ch}
          w={cw - 4}
          h={ch - 6}
        />
      ))}
    </g>
  )
}
