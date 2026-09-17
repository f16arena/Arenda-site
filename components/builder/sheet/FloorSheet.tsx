"use client"

// Лист чертежа плана этажа: А3/А2 со штампом по ГОСТ 21.101 (основная надпись,
// форма 3 в сокращённом виде). SVG в миллиметрах листа — печать один в один,
// «Печать → Сохранить как PDF» даёт готовый лист. DXF — пространство модели 1:1.

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowLeft, Download, Printer } from "lucide-react"
import type { Building, Floor, SectionLineDoc } from "@/types/builder"
import {
  AXIS_GAP,
  BUBBLE_R,
  DIM_BASE,
  DIM_STEP,
  STAMP,
  areaText,
  buildFloorDrawing,
  pickSheet,
  type FloorDrawing,
  type Pt,
  type Sheet,
} from "@/lib/builder/drawing/floor-drawing"
import { floorDrawingToDxf } from "@/lib/builder/drawing/dxf"
import { SECTION_TITLE, buildMepDrawing, sectionsWithContent, type MepDrawing, type SheetSection } from "@/lib/builder/drawing/mep-drawing"
import { MepPlanLayer, MepTables } from "./MepSheetLayer"
import { FACADE_TITLE, buildFacade, buildSection, type ElevationDrawing, type FacadeSide } from "@/lib/builder/drawing/elevation"
import { elevationToDxf } from "@/lib/builder/drawing/dxf"
import { ElevationSvgBody, pickElevationSheet } from "./ElevationSvg"

const FACADES: FacadeSide[] = ["south", "north", "west", "east"]

/** Автоматические разрезы через середину здания — пока своих не нарисовали. */
function autoSections(floors: Floor[]): SectionLineDoc[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const f of floors) for (const id in f.wallGraph.nodes) {
    const n = f.wallGraph.nodes[id]
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
  }
  if (!Number.isFinite(minX)) return []
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  return [
    { id: "auto-1", name: "1-1", a: { x: minX - 2000, y: cy }, b: { x: maxX + 2000, y: cy }, look: 1 },
    { id: "auto-2", name: "2-2", a: { x: cx, y: maxY + 2000 }, b: { x: cx, y: minY - 2000 }, look: 1 },
  ]
}

/** ширина колонки таблиц сетей справа от плана, мм листа */
const TABLES_W = 105

type Props = {
  buildingId: string
  buildingName: string
  address: string
  author: string
  floors: Floor[]
  initialFloorId: string | null
  premiseNumbers: Record<string, string>
  initialSection?: SheetSection
  /** здание целиком — для фасадов и разрезов */
  building?: Building
  /** "plan" | "facade:south" | "section:<id>" */
  initialView?: string
}

/** Перенос по словам в пределах `width` символов, не больше `lines` строк. */
function wrapWords(text: string, width: number, lines: number): string[] {
  const out: string[] = []
  let cur = ""
  for (const word of text.split(/\s+/)) {
    if ((cur + " " + word).trim().length > width && cur) {
      out.push(cur)
      cur = word
    } else cur = (cur + " " + word).trim()
  }
  if (cur) out.push(cur)
  return out.slice(0, lines)
}

function floorTitle(f: Floor): string {
  if (f.level < 0) return `План подвала (${f.name})`
  if (f.level === 0) return "План цокольного этажа"
  return `План ${f.level}-го этажа`
}

export function FloorSheet({ buildingId, buildingName, address, author, floors, initialFloorId, premiseNumbers, initialSection = "ar", building, initialView = "plan" }: Props) {
  const [floorId, setFloorId] = useState(initialFloorId)
  const [view, setView] = useState(initialView)
  const ownSections = building?.sections ?? []
  const sections = ownSections.length ? ownSections : autoSections(building?.floors ?? floors)
  const [section, setSection] = useState<SheetSection>(initialSection)
  const floor = floors.find((f) => f.id === floorId) ?? floors[0]
  const drawing = useMemo(() => (floor ? buildFloorDrawing(floor, (id) => premiseNumbers[id] ?? null) : null), [floor, premiseNumbers])
  const mep = useMemo(() => (floor && section !== "ar" ? buildMepDrawing(floor, section) : null), [floor, section])
  const hasTables = !!mep && (mep.legend.length > 0 || mep.spec.length > 0)
  const sheet = useMemo(() => (drawing ? pickSheet(drawing, hasTables ? TABLES_W + 5 : 0) : null), [drawing, hasTables])
  const available = floor ? sectionsWithContent(floor) : []
  const sheetNo = floor ? Math.max(1, floors.indexOf(floor) + 1) : 1
  const planTitle = floor ? `${floorTitle(floor)}${section === "ar" ? "" : section === "mep" ? ". Сети" : `. ${section}`}` : ""
  const elevation = useMemo<{ d: ElevationDrawing; title: string } | null>(() => {
    if (!building || view === "plan") return null
    if (view.startsWith("facade:")) {
      const side = view.slice(7) as FacadeSide
      return FACADES.includes(side) ? { d: buildFacade(building, side), title: FACADE_TITLE[side] } : null
    }
    const sec = sections.find((x) => `section:${x.id}` === view)
    return sec ? { d: buildSection(building, sec), title: `Разрез ${sec.name}` } : null
  }, [building, view, sections])
  const elevationSheet = useMemo(() => (elevation ? pickElevationSheet(elevation.d) : null), [elevation])
  const title = elevation ? elevation.title : planTitle
  const activeSheet = elevationSheet ?? sheet

  function downloadDxf() {
    if (elevation && elevationSheet) {
      const text = elevationToDxf(elevation.d, elevationSheet.scale, elevation.title)
      const blob = new Blob([text], { type: "application/dxf" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `${buildingName} — ${elevation.title}.dxf`.replace(/[\\/:*?"<>|]/g, "-")
      a.click()
      URL.revokeObjectURL(a.href)
      return
    }
    if (!drawing || !sheet || !floor) return
    const text = floorDrawingToDxf(drawing, sheet.scale, `${title}`, mep)
    const blob = new Blob([text], { type: "application/dxf" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${buildingName} — ${title}.dxf`.replace(/[\\/:*?"<>|]/g, "-")
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!floor || !drawing || !sheet || !activeSheet) {
    return <div className="p-6 text-sm text-slate-500">В модели здания нет этажей — чертить нечего.</div>
  }

  return (
    <div className="flex flex-col gap-3 p-4 print:p-0">
      <style>{`@media print { @page { size: ${activeSheet.format} ${activeSheet.orientation}; margin: 0 } body * { visibility: hidden } #floor-sheet, #floor-sheet * { visibility: visible } #floor-sheet { position: fixed; inset: 0 } }`}</style>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={`/admin/builder/${buildingId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Конструктор
        </Link>
        <select
          id="sheet-view"
          value={view}
          onChange={(e) => setView(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium dark:border-slate-800 dark:bg-slate-900"
        >
          <option value="plan">План этажа</option>
          {building && (
            <optgroup label="Фасады">
              {FACADES.map((f) => <option key={f} value={`facade:${f}`}>{FACADE_TITLE[f]}</option>)}
            </optgroup>
          )}
          {building && (
            <optgroup label={ownSections.length ? "Разрезы" : "Разрезы (авто, свои — инструментом «Разрез»)"}>
              {sections.map((x) => <option key={x.id} value={`section:${x.id}`}>Разрез {x.name}</option>)}
            </optgroup>
          )}
        </select>
        {view === "plan" && <select
          id="sheet-floor"
          value={floor.id}
          onChange={(e) => setFloorId(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-800 dark:bg-slate-900"
        >
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {floorTitle(f)}
            </option>
          ))}
        </select>}
        {view === "plan" && <select
          id="sheet-section"
          value={section}
          onChange={(e) => setSection(e.target.value as SheetSection)}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-800 dark:bg-slate-900"
        >
          <option value="ar">АР — обмерный план</option>
          {available.length > 1 && <option value="mep">Все сети на одном листе</option>}
          {(["ЭМ", "ЭО", "СС", "ВК", "ОВ"] as const).map((s) => (
            <option key={s} value={s} disabled={!available.includes(s)}>
              {s} — {SECTION_TITLE[s].toLowerCase()}{available.includes(s) ? "" : " (пусто)"}
            </option>
          ))}
        </select>}
        <span className="text-xs text-slate-500">
          {activeSheet.format}, {activeSheet.orientation === "portrait" ? "книжный" : "альбомный"}, М 1:{activeSheet.scale}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={downloadDxf}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200"
            title="Пространство модели 1:1 в миллиметрах: стены, проёмы, размеры, оси — по слоям"
          >
            <Download className="h-3.5 w-3.5" /> DXF для AutoCAD
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
            title="В окне печати выберите «Сохранить как PDF» и формат листа"
          >
            <Printer className="h-3.5 w-3.5" /> PDF / печать
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-900 print:border-0 print:bg-white print:p-0">
        <SheetSvg
          drawing={drawing}
          sheet={activeSheet}
          elevation={elevation?.d ?? null}
          sectionMarks={view === "plan" ? ownSections : []}
          title={title}
          buildingName={buildingName}
          address={address}
          author={author}
          sheetNo={sheetNo}
          sheetCount={floors.length}
          section={section}
          mep={mep}
          reserveRight={hasTables ? TABLES_W + 5 : 0}
        />
      </div>
    </div>
  )
}

function SheetSvg({
  drawing: d,
  sheet,
  title,
  buildingName,
  address,
  author,
  sheetNo,
  sheetCount,
  section,
  mep,
  reserveRight,
  elevation,
  sectionMarks,
}: {
  elevation: ElevationDrawing | null
  sectionMarks: SectionLineDoc[]
  drawing: FloorDrawing
  sheet: Sheet
  title: string
  buildingName: string
  address: string
  author: string
  sheetNo: number
  sheetCount: number
  section: SheetSection
  mep: MepDrawing | null
  reserveRight: number
}) {
  const { w, h, scale } = sheet
  const dw = (d.bounds.maxX - d.bounds.minX) / scale
  const dh = (d.bounds.maxY - d.bounds.minY) / scale
  // рабочее поле: рамка 20/5/5/5, над штампом
  const areaX0 = 20, areaX1 = w - 5 - reserveRight, areaY0 = 5 + 10, areaY1 = h - 5 - STAMP.h
  // на листе сетей архитектура — подложкой: серым, чтобы трассы читались
  const arch = section === "ar" ? "#000" : "#8a8f98"
  const wallFill = section === "ar" ? "#1a1a1a" : "#b9bec6"
  const ox = areaX0 + (areaX1 - areaX0 - dw) / 2
  const oy = areaY0 + (areaY1 - areaY0 - dh) / 2
  const X = (x: number) => ox + (x - d.bounds.minX) / scale
  const Y = (y: number) => oy + (d.bounds.maxY - y) / scale
  const P = (p: Pt) => `${X(p.x).toFixed(2)},${Y(p.y).toFixed(2)}`

  const reach = DIM_BASE + DIM_STEP * 3 + AXIS_GAP
  const stampX = w - 5 - STAMP.w
  const stampY = h - 5 - STAMP.h
  const today = new Date().toLocaleDateString("ru-RU", { month: "2-digit", year: "2-digit" })

  return (
    <svg
      id="floor-sheet"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      width={`${w}mm`}
      height={`${h}mm`}
      className="mx-auto block bg-white shadow-lg print:shadow-none"
      style={{ maxWidth: "100%", height: "auto", fontFamily: "'GOST type A', 'ISOCPEUR', Arial, sans-serif" }}
    >
      <rect x={0} y={0} width={w} height={h} fill="#fff" />
      {/* рамка */}
      <rect x={20} y={5} width={w - 25} height={h - 10} fill="none" stroke="#000" strokeWidth={0.7} />

      {elevation ? <ElevationSvgBody d={elevation} sheet={sheet} title={title} /> : <>
      {/* оси */}
      {d.axes.map((ax, i) => {
        if (ax.dir === "v") {
          const x = X(ax.at)
          const y0 = Y(d.bounds.maxY) - reach
          const y1 = Y(d.bounds.minY) + reach
          return (
            <g key={`ax${i}`}>
              <line x1={x} y1={y0} x2={x} y2={y1} stroke="#555" strokeWidth={0.18} strokeDasharray="8 1.5 1 1.5" />
              {[y0 - BUBBLE_R, y1 + BUBBLE_R].map((cy) => (
                <g key={cy}>
                  <circle cx={x} cy={cy} r={BUBBLE_R} fill="#fff" stroke="#000" strokeWidth={0.25} />
                  <text x={x} y={cy + 1.3} fontSize={3.5} textAnchor="middle">{ax.label}</text>
                </g>
              ))}
            </g>
          )
        }
        const y = Y(ax.at)
        const x0 = X(d.bounds.minX) - reach
        const x1 = X(d.bounds.maxX) + reach
        return (
          <g key={`ax${i}`}>
            <line x1={x0} y1={y} x2={x1} y2={y} stroke="#555" strokeWidth={0.18} strokeDasharray="8 1.5 1 1.5" />
            {[x0 - BUBBLE_R, x1 + BUBBLE_R].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy={y} r={BUBBLE_R} fill="#fff" stroke="#000" strokeWidth={0.25} />
                <text x={cx} y={y + 1.3} fontSize={3.5} textAnchor="middle">{ax.label}</text>
              </g>
            ))}
          </g>
        )
      })}

      {/* стены */}
      {d.wallSolids.map((q, i) => (
        <polygon key={`w${i}`} points={q.map(P).join(" ")} fill={wallFill} />
      ))}
      {/* окна, двери */}
      {d.thinLines.map(([a, b], i) => (
        <line key={`l${i}`} x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke={arch} strokeWidth={0.18} />
      ))}
      {d.arcs.map((a, i) => {
        const r = a.r / scale
        const s = { x: a.c.x + a.r * Math.cos((a.start * Math.PI) / 180), y: a.c.y + a.r * Math.sin((a.start * Math.PI) / 180) }
        const e = { x: a.c.x + a.r * Math.cos((a.end * Math.PI) / 180), y: a.c.y + a.r * Math.sin((a.end * Math.PI) / 180) }
        // ось Y листа вниз: дуга против часовой в модели — по часовой на листе
        return <path key={`a${i}`} d={`M ${P(s)} A ${r} ${r} 0 0 0 ${P(e)}`} fill="none" stroke={arch} strokeWidth={0.13} />
      })}

      {/* помещения */}
      {d.rooms.map((r, i) => (
        <g key={`r${i}`}>
          {r.number && (
            <text x={X(r.at.x)} y={Y(r.at.y) - 0.6} fontSize={2.5} textAnchor="middle">
              № {r.number}
            </text>
          )}
          <text x={X(r.at.x)} y={Y(r.at.y) + (r.number ? 2.6 : 0.9)} fontSize={2.5} textAnchor="middle" textDecoration="underline">
            {areaText(r.areaM2)}
          </text>
        </g>
      ))}

      {/* сети */}
      {mep && <MepPlanLayer md={mep} X={X} Y={Y} scale={scale} />}
      {mep && reserveRight > 0 && (
        <MepTables md={mep} x={w - 5 - reserveRight + 3} y={12} w={reserveRight - 6} maxH={h - 5 - STAMP.h - 5 - 12} />
      )}

      {/* размеры */}
      {d.dims.map((dim, i) => {
        const n = dim.side === "top" ? { x: 0, y: -1 } : dim.side === "bottom" ? { x: 0, y: 1 } : dim.side === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 }
        const off = DIM_BASE + DIM_STEP * (dim.level - 1)
        const ax = X(dim.a.x), ay = Y(dim.a.y), bx = X(dim.b.x), by = Y(dim.b.y)
        const vertical = dim.side === "left" || dim.side === "right"
        // размерная линия — от края всего плана (тамбуры, пристройки не перекрываются)
        const edge = vertical ? X(dim.edge) : Y(dim.edge)
        const a2 = vertical ? { x: edge + n.x * off, y: ay } : { x: ax, y: edge + n.y * off }
        const b2 = vertical ? { x: edge + n.x * off, y: by } : { x: bx, y: edge + n.y * off }
        const short = Math.hypot(b2.x - a2.x, b2.y - a2.y) < 6
        const mx = (a2.x + b2.x) / 2, my = (a2.y + b2.y) / 2
        return (
          <g key={`d${i}`} stroke="#000" strokeWidth={0.13}>
            <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} />
            <line x1={ax + n.x * 2} y1={ay + n.y * 2} x2={a2.x + n.x * 1.5} y2={a2.y + n.y * 1.5} />
            <line x1={bx + n.x * 2} y1={by + n.y * 2} x2={b2.x + n.x * 1.5} y2={b2.y + n.y * 1.5} />
            {[a2, b2].map((p, j) => (
              <line key={j} x1={p.x - 1} y1={p.y + 1} x2={p.x + 1} y2={p.y - 1} strokeWidth={0.35} />
            ))}
            {!short && <text
              x={vertical ? mx - 1 : mx}
              y={vertical ? my : my - 1}
              fontSize={2.5}
              textAnchor="middle"
              stroke="none"
              transform={vertical ? `rotate(-90 ${mx - 1} ${my})` : undefined}
            >
              {dim.text}
            </text>}
          </g>
        )
      })}

      {/* название над планом */}
      <text x={(areaX0 + areaX1) / 2} y={Math.max(12, Y(d.bounds.maxY) - reach - BUBBLE_R * 2 - 4)} fontSize={5} textAnchor="middle">
        {title}  <tspan fontSize={3.5}>М 1:{scale}</tspan>
      </text>

      {/* марки разрезов: утолщённые концы, стрелки взгляда, обозначение */}
      {sectionMarks.map((sec) => {
        const L = Math.hypot(sec.b.x - sec.a.x, sec.b.y - sec.a.y)
        if (L < 1) return null
        const t = { x: (sec.b.x - sec.a.x) / L, y: (sec.b.y - sec.a.y) / L }
        // на листе ось Y вниз: направление взгляда в листовых координатах
        const dm = { x: -t.y * sec.look, y: t.x * sec.look }
        const ds = { x: dm.x, y: -dm.y }
        const ts = { x: t.x, y: -t.y }
        const label = sec.name.split("-")[0]
        return (
          <g key={sec.id} stroke="#000" fill="none">
            {[{ p: sec.a, into: ts }, { p: sec.b, into: { x: -ts.x, y: -ts.y } }].map(({ p, into }, k) => {
              const x = X(p.x), y = Y(p.y)
              const tip = { x: x + ds.x * 6, y: y + ds.y * 6 }
              return (
                <g key={k}>
                  <line x1={x} y1={y} x2={x + into.x * 8} y2={y + into.y * 8} strokeWidth={0.8} />
                  <line x1={x} y1={y} x2={tip.x} y2={tip.y} strokeWidth={0.3} />
                  <polygon points={`${tip.x},${tip.y} ${tip.x - ds.x * 2.2 + into.x * 0.9},${tip.y - ds.y * 2.2 + into.y * 0.9} ${tip.x - ds.x * 2.2 - into.x * 0.9},${tip.y - ds.y * 2.2 - into.y * 0.9}`} fill="#000" strokeWidth={0} />
                  <text x={tip.x + ds.x * 3 - into.x * 2} y={tip.y + ds.y * 3 + 1.4} fontSize={4} textAnchor="middle" fill="#000" stroke="none">{label}</text>
                </g>
              )
            })}
            <line x1={X(sec.a.x)} y1={Y(sec.a.y)} x2={X(sec.b.x)} y2={Y(sec.b.y)} strokeWidth={0.18} strokeDasharray="6 1.5 1 1.5" />
          </g>
        )
      })}
      </>}

      {/* основная надпись (ГОСТ 21.101, форма 3, сокращённо) */}
      <g transform={`translate(${stampX} ${stampY})`} stroke="#000" fill="none" fontSize={2.5}>
        <rect x={0} y={0} width={STAMP.w} height={STAMP.h} strokeWidth={0.7} />
        {/* левая часть: изменения и подписи */}
        <line x1={65} y1={0} x2={65} y2={STAMP.h} strokeWidth={0.7} />
        {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((y) => (
          <line key={y} x1={0} y1={y} x2={65} y2={y} strokeWidth={y === 25 ? 0.7 : 0.25} />
        ))}
        {[7, 17, 27, 42, 57].map((x) => (
          <line key={x} x1={x} y1={0} x2={x} y2={30} strokeWidth={0.25} />
        ))}
        {[17, 42, 57].map((x) => (
          <line key={`b${x}`} x1={x} y1={25} x2={x} y2={STAMP.h} strokeWidth={0.25} />
        ))}
        <g stroke="none" fill="#000" fontSize={2.2}>
          {["Изм.", "Кол.уч", "Лист", "№ док.", "Подп.", "Дата"].map((t, i) => (
            <text key={t} x={[3.5, 12, 22, 34.5, 49.5, 61][i]} y={28.8} textAnchor="middle">{t}</text>
          ))}
          <text x={1} y={33.8}>Разраб.</text>
          <text x={18} y={33.8}>{author.slice(0, 14)}</text>
          <text x={57.5} y={33.8}>{today}</text>
          <text x={1} y={38.8}>Пров.</text>
          <text x={1} y={48.8}>Н. контр.</text>
          <text x={1} y={53.8}>Утв.</text>
        </g>
        {/* правая часть */}
        <line x1={65} y1={15} x2={STAMP.w} y2={15} strokeWidth={0.7} />
        <line x1={65} y1={40} x2={STAMP.w} y2={40} strokeWidth={0.7} />
        <line x1={135} y1={15} x2={135} y2={STAMP.h} strokeWidth={0.7} />
        <line x1={135} y1={20} x2={STAMP.w} y2={20} strokeWidth={0.25} />
        <line x1={135} y1={25} x2={STAMP.w} y2={25} strokeWidth={0.7} />
        <line x1={150} y1={15} x2={150} y2={25} strokeWidth={0.25} />
        <line x1={165} y1={15} x2={165} y2={25} strokeWidth={0.25} />
        <g stroke="none" fill="#000">
          <text x={125} y={9.5} fontSize={4} textAnchor="middle">{buildingName}</text>
          {wrapWords(address, 46, 2).map((line, i) => (
            <text key={i} x={100} y={23 + i * 6} fontSize={2.6} textAnchor="middle">{line}</text>
          ))}
          <text x={100} y={48.5} fontSize={3.5} textAnchor="middle">{title}</text>
          <text x={142.5} y={18.8} fontSize={2.2} textAnchor="middle">Стадия</text>
          <text x={157.5} y={18.8} fontSize={2.2} textAnchor="middle">Лист</text>
          <text x={175} y={18.8} fontSize={2.2} textAnchor="middle">Листов</text>
          <text x={142.5} y={23.8} fontSize={2.8} textAnchor="middle">И</text>
          <text x={157.5} y={23.8} fontSize={2.8} textAnchor="middle">{sheetNo}</text>
          <text x={175} y={23.8} fontSize={2.8} textAnchor="middle">{sheetCount}</text>
          <text x={160} y={34} fontSize={2.6} textAnchor="middle">{elevation ? (elevation.kind === "facade" ? "Фасады" : "Разрезы") : SECTION_TITLE[section]}</text>
          <text x={160} y={48.5} fontSize={3} textAnchor="middle">Commrent</text>
        </g>
      </g>
    </svg>
  )
}
