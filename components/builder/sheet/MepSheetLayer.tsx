// Сети на листе чертежа: трассы с марками, условные знаки приборов и таблицы
// «Условные обозначения» и «Спецификация». Размеры знаков — в мм листа,
// не зависят от масштаба, как принято на рабочих чертежах.

import type { MepSymbol } from "@/lib/builder/mep/catalog"
import { MEP_SYSTEM_INFO } from "@/lib/builder/mep/catalog"
import type { MepDrawing } from "@/lib/builder/drawing/mep-drawing"
import type { Pt } from "@/lib/builder/drawing/floor-drawing"
import { useT } from "@/lib/i18n/client"

const SW = 0.3

/** Знак в локальных координатах: 1 = 1 мм листа, +y — «лицо» прибора (от стены в комнату). */
export function SymbolGlyph({ symbol, color, lengthMm = 4 }: { symbol: MepSymbol | "line"; color: string; lengthMm?: number }) {
  const common = { fill: "none", stroke: color, strokeWidth: SW }
  switch (symbol) {
    case "line":
      return <line x1={-5} y1={0} x2={5} y2={0} stroke={color} strokeWidth={0.5} />
    case "panel":
      return (
        <g {...common}>
          <rect x={-3} y={0} width={6} height={2.4} />
          <polygon points="-3,0 3,2.4 -3,2.4" fill={color} stroke="none" />
        </g>
      )
    case "socket":
    case "socket2":
      return (
        <g {...common}>
          <path d="M -1.6 0 A 1.6 1.6 0 0 1 1.6 0 Z" />
          {symbol === "socket" ? <line x1={0} y1={1.6} x2={0} y2={2.8} /> : (
            <>
              <line x1={-0.7} y1={1.45} x2={-0.7} y2={2.7} />
              <line x1={0.7} y1={1.45} x2={0.7} y2={2.7} />
            </>
          )}
        </g>
      )
    case "switch":
      return (
        <g {...common}>
          <circle cx={0} cy={1.2} r={0.9} />
          <line x1={0.64} y1={1.84} x2={1.9} y2={3.1} />
          <line x1={1.9} y1={3.1} x2={2.6} y2={2.4} />
        </g>
      )
    case "lamp":
      return (
        <g {...common}>
          <circle cx={0} cy={0} r={2} />
          <line x1={-1.41} y1={-1.41} x2={1.41} y2={1.41} />
          <line x1={-1.41} y1={1.41} x2={1.41} y2={-1.41} />
        </g>
      )
    case "lampPanel":
      return (
        <g {...common}>
          <rect x={-2.2} y={-2.2} width={4.4} height={4.4} />
          <line x1={-2.2} y1={-2.2} x2={2.2} y2={2.2} />
          <line x1={-2.2} y1={2.2} x2={2.2} y2={-2.2} />
        </g>
      )
    case "exit":
      return (
        <g {...common}>
          <rect x={-2.2} y={0} width={4.4} height={2} />
          <polygon points="-2.2,0 0,2 -2.2,2" fill={color} stroke="none" />
          <polygon points="2.2,0 0,2 2.2,2" fill={color} stroke="none" />
        </g>
      )
    case "data":
      return <polygon points="-1.6,0 1.6,0 0,2.6" {...common} />
    case "camera":
      return (
        <g {...common}>
          <rect x={-1} y={0} width={2} height={2.2} />
          <polygon points="-1,2.2 1,2.2 1.8,3.4 -1.8,3.4" />
        </g>
      )
    case "detector":
      return (
        <g {...common}>
          <circle cx={0} cy={0} r={1.5} />
          <circle cx={0} cy={0} r={0.35} fill={color} />
        </g>
      )
    case "riser":
      return (
        <g {...common}>
          <circle cx={0} cy={0} r={1.8} />
          <circle cx={0} cy={0} r={0.6} fill={color} />
        </g>
      )
    case "fixture":
      return <rect x={-1.8} y={0} width={3.6} height={2.6} rx={0.9} {...common} />
    case "drain":
      return (
        <g {...common}>
          <rect x={-1.4} y={-1.4} width={2.8} height={2.8} />
          <circle cx={0} cy={0} r={0.8} />
        </g>
      )
    case "radiator": {
      const L = Math.max(4, lengthMm)
      return (
        <g {...common}>
          <rect x={-L / 2} y={0} width={L} height={1.4} />
          {Array.from({ length: Math.max(2, Math.floor(L / 1.2)) }, (_, i) => {
            const x = -L / 2 + (i + 1) * (L / (Math.max(2, Math.floor(L / 1.2)) + 1))
            return <line key={i} x1={x} y1={0} x2={x} y2={1.4} strokeWidth={0.15} />
          })}
        </g>
      )
    }
    case "diffuser":
      return (
        <g {...common}>
          <rect x={-2} y={-2} width={4} height={4} />
          <line x1={-2} y1={-2} x2={2} y2={2} />
          <line x1={-2} y1={2} x2={2} y2={-2} />
          <rect x={-0.9} y={-0.9} width={1.8} height={1.8} />
        </g>
      )
    default:
      return (
        <g {...common}>
          <rect x={-2.4} y={0} width={4.8} height={3} />
          <line x1={-2.4} y1={0} x2={2.4} y2={3} />
        </g>
      )
  }
}

export function MepPlanLayer({ md, X, Y, scale }: { md: MepDrawing; X: (x: number) => number; Y: (y: number) => number; scale: number }) {
  const P = (p: Pt) => `${X(p.x).toFixed(2)},${Y(p.y).toFixed(2)}`
  return (
    <g>
      {md.runs.map((r, i) => {
        const color = MEP_SYSTEM_INFO[r.system].color
        const tx = X(r.tagAt.x), ty = Y(r.tagAt.y)
        const tw = r.tag.length * 1.45 + 1.4
        return (
          <g key={`mr${i}`}>
            <polyline points={r.points.map(P).join(" ")} fill="none" stroke={color} strokeWidth={0.5} strokeLinejoin="round" />
            <g transform={`translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${-r.tagAngle})`}>
              <rect x={-tw / 2} y={-1.5} width={tw} height={3} fill="#fff" />
              <text x={0} y={1} fontSize={2.5} textAnchor="middle" fill={color}>{r.tag}</text>
            </g>
          </g>
        )
      })}
      {md.devices.map((d, i) => {
        const color = MEP_SYSTEM_INFO[d.system].color
        const x = X(d.at.x), y = Y(d.at.y)
        return (
          <g key={`md${i}`}>
            <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${-d.rotation}) scale(1 -1)`}>
              <SymbolGlyph symbol={d.symbol} color={color} lengthMm={d.widthMm / scale} />
            </g>
            {d.label && (
              <text x={x + 2.6} y={y - 2.2} fontSize={2.2} fill={color}>{d.label}</text>
            )}
          </g>
        )
      })}
    </g>
  )
}

const ROW_LEGEND = 6
const ROW_SPEC = 4.6

/** Таблицы справа от плана. Возвращает то, что влезло по высоте. */
export function MepTables({ md, x, y, w, maxH }: { md: MepDrawing; x: number; y: number; w: number; maxH: number }) {
  const { t } = useT()
  const out: React.ReactNode[] = []
  let cy = y
  const limit = y + maxH
  const line = (y1: number, key: string, strong = false) => <line key={key} x1={x} y1={y1} x2={x + w} y2={y1} stroke="#000" strokeWidth={strong ? 0.5 : 0.18} />

  if (md.legend.length) {
    out.push(<text key="lt" x={x + w / 2} y={cy + 4} fontSize={3} textAnchor="middle">{t("adminBuilderSheet.sheet.legend")}</text>)
    cy += 6
    out.push(line(cy, "l0", true))
    for (const [i, row] of md.legend.entries()) {
      if (cy + ROW_LEGEND > limit) break
      const color = MEP_SYSTEM_INFO[row.system].color
      out.push(
        <g key={`lg${i}`}>
          <g transform={`translate(${x + 9} ${cy + (row.symbol === "line" ? ROW_LEGEND / 2 : ROW_LEGEND / 2 + (["lamp", "lampPanel", "detector", "riser", "drain", "diffuser"].includes(row.symbol) ? 0 : 1.4))}) scale(1 -1)`}>
            <SymbolGlyph symbol={row.symbol} color={color} />
          </g>
          <text x={x + 20} y={cy + ROW_LEGEND / 2 + 0.9} fontSize={2.5}>{row.text}</text>
        </g>,
      )
      cy += ROW_LEGEND
      out.push(line(cy, `ll${i}`))
    }
    out.push(<line key="lv" x1={x + 18} y1={y + 6} x2={x + 18} y2={cy} stroke="#000" strokeWidth={0.18} />)
    out.push(<rect key="lr" x={x} y={y + 6} width={w} height={cy - y - 6} fill="none" stroke="#000" strokeWidth={0.5} />)
    cy += 6
  }

  if (md.spec.length) {
    const top = cy
    out.push(<text key="st" x={x + w / 2} y={cy + 4} fontSize={3} textAnchor="middle">{t("adminBuilderSheet.sheet.mepSpec")}</text>)
    cy += 6
    const cQty = x + w - 22, cUnit = x + w - 9
    out.push(line(cy, "s0", true))
    out.push(<text key="h1" x={x + 2} y={cy + 3.3} fontSize={2.3}>{t("adminBuilderSheet.sheet.colName")}</text>)
    out.push(<text key="h2" x={cQty + 11} y={cy + 3.3} fontSize={2.3} textAnchor="end">{t("adminBuilderSheet.sheet.thQtyShort")}</text>)
    out.push(<text key="h3" x={cUnit + 1.5} y={cy + 3.3} fontSize={2.3}>{t("adminBuilderSheet.sheet.thUnit")}</text>)
    cy += ROW_SPEC + 0.4
    out.push(line(cy, "s1", true))
    let cut = 0
    const rows: { kind: "sys" | "row"; text: string; qty?: string; unit?: string; color?: string }[] = []
    for (const s of md.spec) {
      const info = MEP_SYSTEM_INFO[s.system]
      const pw = s.powerW ? t("adminBuilderSheet.sheet.mepSystemPower", { value: (s.powerW / 1000).toFixed(2).replace(".", ",") }) : ""
      rows.push({ kind: "sys", text: `${t("adminBuilderSheet.sheet.mepSystemRow", { mark: info.mark, name: t(`adminBuilder.mep.systems.${s.system}`) })}${pw}`, color: info.color })
      for (const r of s.rows) rows.push({ kind: "row", text: r.name, qty: r.unit === "m" ? r.qty.toFixed(1).replace(".", ",") : String(r.qty), unit: t(r.unit === "m" ? "adminBuilder.mep.unitM" : "adminBuilder.mep.unitPcs") })
    }
    for (const [i, r] of rows.entries()) {
      if (cy + ROW_SPEC > limit - 4) {
        cut = rows.length - i
        break
      }
      const maxChars = Math.floor((cQty - x - 4) / 1.35)
      const text = r.text.length > maxChars ? `${r.text.slice(0, maxChars - 1)}…` : r.text
      out.push(
        <g key={`sr${i}`}>
          <text x={x + (r.kind === "sys" ? 2 : 4)} y={cy + 3.2} fontSize={2.3} fontWeight={r.kind === "sys" ? 700 : 400} fill={r.color ?? "#000"}>{text}</text>
          {r.qty && <text x={cQty + 11} y={cy + 3.2} fontSize={2.3} textAnchor="end">{r.qty}</text>}
          {r.unit && <text x={cUnit + 1.5} y={cy + 3.2} fontSize={2.3}>{r.unit}</text>}
        </g>,
      )
      cy += ROW_SPEC
      out.push(line(cy, `sl${i}`))
    }
    out.push(<line key="v1" x1={cQty} y1={top + 6} x2={cQty} y2={cy} stroke="#000" strokeWidth={0.18} />)
    out.push(<line key="v2" x1={cUnit} y1={top + 6} x2={cUnit} y2={cy} stroke="#000" strokeWidth={0.18} />)
    out.push(<rect key="sr" x={x} y={top + 6} width={w} height={cy - top - 6} fill="none" stroke="#000" strokeWidth={0.5} />)
    if (cut) out.push(<text key="cut" x={x} y={cy + 3.5} fontSize={2.2}>{t("adminBuilderSheet.sheet.moreRowsMep", { count: cut })}</text>)
    cy += 8
  }

  // расчётные таблицы щитов
  for (const pn of md.panels) {
    if (cy + 20 > limit) break
    const top = cy
    out.push(<text key={`pt${pn.panelId}`} x={x + w / 2} y={cy + 4} fontSize={3} textAnchor="middle">{t("adminBuilderSheet.sheet.panelTable", { label: pn.label })}</text>)
    cy += 6
    const cols = [
      { w: 7, l: t("adminBuilderSheet.sheet.thGroup") }, { w: w - 7 - 11 - 9 - 9 - 23 - 9, l: t("adminBuilderSheet.sheet.thPurpose") }, { w: 11, l: t("adminBuilderSheet.sheet.thPowerInst") }, { w: 9, l: t("adminBuilderSheet.sheet.thCurrent") }, { w: 9, l: t("adminBuilderSheet.sheet.thBreaker") }, { w: 23, l: t("adminBuilderSheet.sheet.thCable") }, { w: 9, l: t("adminBuilderSheet.sheet.thDrop") },
    ]
    const xs: number[] = []
    let acc = x
    for (const c of cols) { xs.push(acc); acc += c.w }
    out.push(<line key={`ph0${pn.panelId}`} x1={x} y1={cy} x2={x + w} y2={cy} stroke="#000" strokeWidth={0.5} />)
    cols.forEach((c, i) => out.push(<text key={`ph${pn.panelId}${i}`} x={xs[i] + 0.8} y={cy + 3.2} fontSize={1.9}>{c.l}</text>))
    cy += 4.6
    out.push(<line key={`ph1${pn.panelId}`} x1={x} y1={cy} x2={x + w} y2={cy} stroke="#000" strokeWidth={0.5} />)
    for (const g of pn.groups) {
      if (cy + 4.2 > limit - 6) break
      const maxChars = Math.floor((cols[1].w - 1.5) / 1.05)
      const cells = [String(g.group), g.purpose.length > maxChars ? `${g.purpose.slice(0, maxChars - 1)}…` : g.purpose, (g.pInstW / 1000).toFixed(2).replace(".", ","), g.currentA.toFixed(1).replace(".", ","), String(g.breakerA), g.cableMark.replace("ВВГнг(А)-LS ", "ВВГнг ") + `, ${Math.round(g.lengthM)} м`, g.dropPct.toFixed(1).replace(".", ",")]
      cells.forEach((c, i) => out.push(<text key={`pr${pn.panelId}${g.group}${i}`} x={xs[i] + 0.8} y={cy + 3} fontSize={1.9} fill={i === 6 && g.dropPct > 4 ? "#b91c1c" : "#000"}>{c}</text>))
      cy += 4.2
      out.push(<line key={`pl${pn.panelId}${g.group}`} x1={x} y1={cy} x2={x + w} y2={cy} stroke="#000" strokeWidth={0.18} />)
    }
    out.push(<text key={`ptot${pn.panelId}`} x={x + 1} y={cy + 3.3} fontSize={2.1} fontWeight={700}>{t("adminBuilderSheet.sheet.panelTotals", { inst: (pn.pInstW / 1000).toFixed(2).replace(".", ","), calc: (pn.pCalcW / 1000).toFixed(2).replace(".", ","), current: pn.currentA.toFixed(1).replace(".", ","), breaker: pn.inputBreakerA })}</text>)
    cy += 5
    xs.slice(1).forEach((xx, i) => out.push(<line key={`pv${pn.panelId}${i}`} x1={xx} y1={top + 6} x2={xx} y2={cy - 5} stroke="#000" strokeWidth={0.18} />))
    out.push(<rect key={`pb${pn.panelId}`} x={x} y={top + 6} width={w} height={cy - top - 6} fill="none" stroke="#000" strokeWidth={0.5} />)
    cy += 6
  }
  return <g>{out}</g>
}
