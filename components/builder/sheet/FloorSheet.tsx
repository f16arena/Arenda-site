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
import { dimGeometry } from "@/lib/builder/annotations"
import { openingName, openingSchedule, roomExplication, type OpeningSchedule, type RoomRow } from "@/lib/builder/drawing/schedules"

/** Экспликация и ведомость проёмов для листа плана этажа; марки — по всему зданию. */
export function planExtras(allFloors: Floor[], floor: Floor, premiseNumber: (id: string) => string | null, stage: PlanStage = "plan") {
  const schedule = openingSchedule(allFloors)
  // экспликация считается по той же стадии, что и план: иначе у части помещений
  // номер на плане не совпадал с таблицей (на обмерном плане новых стен ещё нет)
  const staged = stage === "edit" ? floor : floorAtStage(floor, stage === "plan" || stage === "demolish" ? "before" : "after")
  const rooms = roomExplication(staged, premiseNumber)
  const roomNumbers = new Map(rooms.map((r) => [r.roomId, r.number]))
  return { schedule, rooms, options: { openingMarks: schedule.marks, roomNumbers } }
}
import { floorAtStage, hasReplan, replanSummary, type ReplanSummary } from "@/lib/builder/replan"
import { buildingIndicators, type BuildingIndicators } from "@/lib/builder/drawing/indicators"
import type { PlanStage } from "@/lib/builder/drawing/floor-drawing"

export const STAGE_TITLE: Record<Exclude<PlanStage, "plan" | "edit">, string> = {
  demolish: "План демонтажа",
  install: "План монтажа",
  after: "План после перепланировки",
}

export const FACADES: FacadeSide[] = ["south", "north", "west", "east"]

/** Автоматические разрезы через середину здания — пока своих не нарисовали. */
export function autoSections(floors: Floor[]): SectionLineDoc[] {
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
export const TABLES_W = 105

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

export function floorTitle(f: Floor): string {
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
  const stage: PlanStage = view.startsWith("replan:") ? (view.slice(7) as PlanStage) : "plan"
  const isPlanView = view === "plan" || view.startsWith("replan:")
  const extras = useMemo(() => (floor ? planExtras(building?.floors ?? floors, floor, (id) => premiseNumbers[id] ?? null, stage) : null), [building, floors, floor, premiseNumbers, stage])
  const drawing = useMemo(() => (floor && extras ? buildFloorDrawing(floor, (id) => premiseNumbers[id] ?? null, stage, extras.options) : null), [floor, premiseNumbers, stage, extras])
  const replan = useMemo(() => (floor && hasReplan(floor) ? replanSummary(floor) : null), [floor])
  const mep = useMemo(() => {
    if (!floor || section === "ar" || view !== "plan") return null
    const numbers = new Map((extras?.rooms ?? []).map((r) => [r.roomId, r.number]))
    return buildMepDrawing(floor, section, (rid) => numbers.get(rid) ?? null)
  }, [floor, section, view, extras])
  const replanTables = stage !== "plan" && !!replan
  const arTables = view === "plan" && section === "ar" && !!extras && (extras.rooms.length > 0 || extras.schedule.rows.length > 0)
  const hasTables = (!!mep && (mep.legend.length > 0 || mep.spec.length > 0)) || replanTables || arTables
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
  const title = elevation ? elevation.title : stage !== "plan" && stage !== "edit" && floor ? `${floorTitle(floor)}. ${STAGE_TITLE[stage]}` : planTitle
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
      <style>{`@media print { @page { size: ${activeSheet.w}mm ${activeSheet.h}mm; margin: 0 } body * { visibility: hidden } #floor-sheet, #floor-sheet * { visibility: visible } #floor-sheet { position: fixed; inset: 0 } }`}</style>

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
          {replan && (
            <optgroup label="Перепланировка этажа">
              <option value="replan:demolish">План демонтажа</option>
              <option value="replan:install">План монтажа</option>
              <option value="replan:after">План после перепланировки</option>
            </optgroup>
          )}
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
        {isPlanView && <select
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
          <Link
            href={`/admin/builder/${buildingId}/sheet?album=1`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200"
            title="Все листы проекта подряд: ведомость, планы, перепланировка, сети, фасады, разрезы — одним PDF"
          >
            Альбом
          </Link>
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
          replan={replanTables ? replan : null}
          stage={stage}
          ar={arTables && extras && floor ? { rooms: extras.rooms, schedule: extras.schedule, floorId: floor.id } : null}
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

export function SheetSvg({
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
  replan,
  stage,
  svgId = "floor-sheet",
  cover,
  indicators,
  ar,
}: {
  /** экспликация и ведомость проёмов справа от плана */
  ar?: { rooms: RoomRow[]; schedule: OpeningSchedule; floorId: string } | null
  svgId?: string
  /** титульный лист альбома: ведомость листов вместо чертежа */
  cover?: Array<{ no: number; title: string; note: string }>
  /** показатели здания для листа «Общие данные» */
  indicators?: BuildingIndicators | null
  replan: ReplanSummary | null
  stage: PlanStage
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
      id={svgId}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      width={`${w}mm`}
      height={`${h}mm`}
      className="mx-auto block bg-white shadow-lg print:shadow-none"
      style={{ maxWidth: "100%", height: "auto", fontFamily: "'GOST type A', 'ISOCPEUR', Arial, sans-serif" }}
    >
      <defs>
        <pattern id="hatch-new" patternUnits="userSpaceOnUse" width={1.6} height={1.6} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={1.6} stroke="#000" strokeWidth={0.25} />
        </pattern>
        <pattern id="sheet-mop" patternUnits="userSpaceOnUse" width={2.4} height={2.4} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={2.4} stroke="#9ca3af" strokeWidth={0.12} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={w} height={h} fill="#fff" />
      {/* рамка */}
      <rect x={20} y={5} width={w - 25} height={h - 10} fill="none" stroke="#000" strokeWidth={0.7} />

      {cover ? <CoverBody rows={cover} w={w} indicators={indicators ?? null} /> : elevation ? <ElevationSvgBody d={elevation} sheet={sheet} title={title} /> : <>
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
      {d.wallSolids.map((q, i) => {
        const st = d.wallStyles[i] ?? "solid"
        if (st === "solid") return <polygon key={`w${i}`} points={q.map(P).join(" ")} fill={wallFill} />
        if (st === "new") return <polygon key={`w${i}`} points={q.map(P).join(" ")} fill="url(#hatch-new)" stroke="#000" strokeWidth={0.3} />
        return <polygon key={`w${i}`} points={q.map(P).join(" ")} fill="#fff" stroke="#000" strokeWidth={0.3} strokeDasharray="1.2 0.8" />
      })}
      {d.patches.map((p, i) => (
        <g key={`p${i}`}>
          <polygon points={p.q.map(P).join(" ")} fill={p.style === "new" ? "url(#hatch-new)" : "#fff"} stroke="#000" strokeWidth={0.3} strokeDasharray={p.style === "demolish" ? "1.2 0.8" : undefined} />
          {p.style === "demolish" && <line x1={X(p.q[0].x)} y1={Y(p.q[0].y)} x2={X(p.q[2].x)} y2={Y(p.q[2].y)} stroke="#000" strokeWidth={0.2} />}
          {p.style === "demolish" && <line x1={X(p.q[1].x)} y1={Y(p.q[1].y)} x2={X(p.q[3].x)} y2={Y(p.q[3].y)} stroke="#000" strokeWidth={0.2} />}
        </g>
      ))}
      {replan && reserveRight > 0 && (
        <ReplanTables summary={replan} stage={stage} x={w - 5 - reserveRight + 3} y={12} w={reserveRight - 6} maxH={h - 5 - STAMP.h - 5 - 12} />
      )}
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
      {/* МОП и технические — лёгкая штриховка: часть здания, не аренда */}
      {d.rooms.filter((r) => r.use !== "rent").map((r, i) => (
        <path key={`mop${i}`} d={[r.polygon, ...r.holes].map((ring) => ring.map((q, k) => `${k ? "L" : "M"}${X(q.x).toFixed(2)} ${Y(q.y).toFixed(2)}`).join(" ") + " Z").join(" ")} fillRule="evenodd" fill="url(#sheet-mop)" stroke="none" />
      ))}
      {d.rooms.map((r, i) => {
        const top = r.number ?? (r.name || null)
        return (
          <g key={`r${i}`}>
            {top && (
              <text x={X(r.at.x)} y={Y(r.at.y) - 0.6} fontSize={r.number ? 2.5 : 2.2} textAnchor="middle" fontStyle={r.number ? undefined : "italic"}>
                {r.number ? `№ ${r.number}` : r.name}
              </text>
            )}
            <text x={X(r.at.x)} y={Y(r.at.y) + (top ? 2.6 : 0.9)} fontSize={2.5} textAnchor="middle" textDecoration="underline">
              {areaText(r.areaM2)}
            </text>
          </g>
        )
      })}

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

      {/* размеры и надписи инженера */}
      {d.userDims.map((ud, i) => {
        // в мм листа: вынос и засечки считаем в координатах листа (ось Y вниз)
        const a = { x: X(ud.a.x), y: Y(ud.a.y) }, b = { x: X(ud.b.x), y: Y(ud.b.y) }
        const g = dimGeometry(a, b, -ud.offset / scale, 1.5)
        const L = g.lengthMm || 1
        const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
        const s = Math.sign(-ud.offset || 1)
        const tx = g.mid.x + g.n.x * 1.4 * s, ty = g.mid.y + g.n.y * 1.4 * s
        return (
          <g key={`ud${i}`} stroke="#000" strokeWidth={0.13}>
            <line x1={g.p1.x} y1={g.p1.y} x2={g.p2.x} y2={g.p2.y} />
            {g.ext.map(([p, q], j) => <line key={j} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />)}
            {[g.p1, g.p2].map((p, j) => <line key={`t${j}`} x1={p.x - (u.x + g.n.x) * 0.8} y1={p.y - (u.y + g.n.y) * 0.8} x2={p.x + (u.x + g.n.x) * 0.8} y2={p.y + (u.y + g.n.y) * 0.8} strokeWidth={0.35} />)}
            <text x={tx} y={ty} fontSize={2.5} textAnchor="middle" dominantBaseline="middle" stroke="none" transform={`rotate(${g.angleDeg} ${tx} ${ty})`}>{Math.round(Math.hypot(ud.b.x - ud.a.x, ud.b.y - ud.a.y))}</text>
          </g>
        )
      })}
      {d.stairWells.map((q, i) => (
        <polygon key={`sw${i}`} points={q.map(P).join(" ")} fill="none" stroke="#000" strokeWidth={0.3} strokeDasharray="4 1.2 1 1.2" />
      ))}
      {d.stairArrows.map((pts, i) => {
        const sp = pts.map((p) => ({ x: X(p.x), y: Y(p.y) }))
        const e = sp[sp.length - 1], b = sp[sp.length - 2]
        const L = Math.hypot(e.x - b.x, e.y - b.y) || 1
        const ux = (e.x - b.x) / L, uy = (e.y - b.y) / L
        return (
          <g key={`sa${i}`} stroke="#000" strokeWidth={0.18} fill="none">
            <circle cx={sp[0].x} cy={sp[0].y} r={0.6} fill="#000" />
            <polyline points={sp.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")} />
            <polygon points={`${e.x},${e.y} ${e.x - ux * 2 - uy * 0.8},${e.y - uy * 2 + ux * 0.8} ${e.x - ux * 2 + uy * 0.8},${e.y - uy * 2 - ux * 0.8}`} fill="#000" />
          </g>
        )
      })}
      {d.lifts.map((lf, i) => (
        <g key={`lf${i}`} stroke="#000" fill="none">
          <polygon points={lf.shaft.map(P).join(" ")} strokeWidth={0.5} />
          <polygon points={lf.cabin.map(P).join(" ")} strokeWidth={0.25} />
          <line x1={X(lf.cabin[0].x)} y1={Y(lf.cabin[0].y)} x2={X(lf.cabin[2].x)} y2={Y(lf.cabin[2].y)} strokeWidth={0.18} />
          <line x1={X(lf.cabin[1].x)} y1={Y(lf.cabin[1].y)} x2={X(lf.cabin[3].x)} y2={Y(lf.cabin[3].y)} strokeWidth={0.18} />
        </g>
      ))}
      {d.exits.map((ex, i) => {
        const x = X(ex.at.x), y = Y(ex.at.y)
        const dx = ex.dir.x, dy = -ex.dir.y
        const tip = { x: x + dx * 6, y: y + dy * 6 }
        return (
          <g key={`ex${i}`} stroke="#000" strokeWidth={0.35} fill="none">
            <line x1={x} y1={y} x2={tip.x} y2={tip.y} />
            <polygon points={`${tip.x},${tip.y} ${tip.x - dx * 2 - dy * 1},${tip.y - dy * 2 + dx * 1} ${tip.x - dx * 2 + dy * 1},${tip.y - dy * 2 - dx * 1}`} fill="#000" />
            <text x={tip.x + dx * 4} y={tip.y + dy * 4} fontSize={2.3} textAnchor="middle" dominantBaseline="middle" stroke="none" fill="#000">{ex.kind === "emergency" ? "Выход" : "Вход"}</text>
          </g>
        )
      })}
      {d.marks.map((m, i) => (
        <text key={`mk${i}`} x={X(m.at.x)} y={Y(m.at.y)} fontSize={2.2} textAnchor="middle" dominantBaseline="middle">{m.text}</text>
      ))}
      {ar && reserveRight > 0 && (
        <ArTables rooms={ar.rooms} schedule={ar.schedule} floorId={ar.floorId} x={w - 5 - reserveRight + 3} y={12} w={reserveRight - 6} maxH={h - 5 - STAMP.h - 5 - 12} />
      )}
      {d.texts.map((t, i) => (
        <text key={`tx${i}`} x={X(t.at.x)} y={Y(t.at.y)} fontSize={3} textAnchor="middle" dominantBaseline="middle">{t.text}</text>
      ))}

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
          <text x={160} y={34} fontSize={2.6} textAnchor="middle">{cover ? "Общие данные" : elevation ? (elevation.kind === "facade" ? "Фасады" : "Разрезы") : stage !== "plan" ? "Перепланировка" : SECTION_TITLE[section]}</text>
          <text x={160} y={48.5} fontSize={3} textAnchor="middle">Commrent</text>
        </g>
      </g>
    </svg>
  )
}

/** Условные обозначения перепланировки и экспликация «было — стало». */
function ReplanTables({ summary, stage, x, y, w, maxH }: { summary: ReplanSummary; stage: PlanStage; x: number; y: number; w: number; maxH: number }) {
  const out: React.ReactNode[] = []
  let cy = y
  const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(1).replace(".", ","))
  out.push(<text key="lt" x={x + w / 2} y={cy + 4} fontSize={3} textAnchor="middle">Условные обозначения</text>)
  cy += 7
  const rows: Array<{ key: string; draw: (yy: number) => React.ReactNode; text: string }> = [
    { key: "e", draw: (yy) => <rect x={x + 3} y={yy} width={12} height={3} fill="#1a1a1a" />, text: "Существующие стены" },
  ]
  if (stage === "demolish") rows.push({ key: "d", draw: (yy) => (
    <g><rect x={x + 3} y={yy} width={12} height={3} fill="#fff" stroke="#000" strokeWidth={0.3} strokeDasharray="1.2 0.8" /><line x1={x + 3} y1={yy} x2={x + 15} y2={yy + 3} stroke="#000" strokeWidth={0.2} /><line x1={x + 3} y1={yy + 3} x2={x + 15} y2={yy} stroke="#000" strokeWidth={0.2} /></g>
  ), text: "Демонтируемые конструкции, пробивка" })
  if (stage === "install") rows.push({ key: "n", draw: (yy) => <rect x={x + 3} y={yy} width={12} height={3} fill="url(#hatch-new)" stroke="#000" strokeWidth={0.3} />, text: "Возводимые конструкции, закладка" })
  for (const r of rows) {
    out.push(<g key={r.key}>{r.draw(cy)}<text x={x + 19} y={cy + 2.6} fontSize={2.5}>{r.text}</text></g>)
    cy += 6
  }
  cy += 3

  const top = cy
  out.push(<text key="et" x={x + w / 2} y={cy + 4} fontSize={3} textAnchor="middle">Экспликация помещений</text>)
  cy += 6
  const c1 = x + 10, c2 = x + w - 32, c3 = x + w - 16
  out.push(<line key="h0" x1={x} y1={cy} x2={x + w} y2={cy} stroke="#000" strokeWidth={0.5} />)
  out.push(<text key="h1" x={x + 5} y={cy + 3.4} fontSize={2.3} textAnchor="middle">№</text>)
  out.push(<text key="h2" x={c1 + 2} y={cy + 3.4} fontSize={2.3}>Изменение</text>)
  out.push(<text key="h3" x={c3 - 1} y={cy + 3.4} fontSize={2.3} textAnchor="end">Было, м²</text>)
  out.push(<text key="h4" x={x + w - 1} y={cy + 3.4} fontSize={2.3} textAnchor="end">Стало</text>)
  cy += 5
  out.push(<line key="h5" x1={x} y1={cy} x2={x + w} y2={cy} stroke="#000" strokeWidth={0.5} />)
  let cut = 0
  // в таблицу — только изменённые помещения; неизменные учтены в итоге
  const changed = summary.rooms.filter((r) => r.before === null || r.after === null || Math.abs(r.after - r.before) >= 0.05)
  const unchanged = summary.rooms.length - changed.length
  changed.forEach((r, i) => {
    if (cy + 4.6 > y + maxH - 16) { cut++; return }
    const change = r.before === null ? "новое" : r.after === null ? "упразднено" : Math.abs(r.after - r.before) < 0.05 ? "без изменений" : "изменено"
    out.push(
      <g key={`r${i}`}>
        <text x={x + 5} y={cy + 3.3} fontSize={2.3} textAnchor="middle">{i + 1}</text>
        <text x={c1 + 2} y={cy + 3.3} fontSize={2.3}>{change}</text>
        <text x={c3 - 1} y={cy + 3.3} fontSize={2.3} textAnchor="end">{fmt(r.before)}</text>
        <text x={x + w - 1} y={cy + 3.3} fontSize={2.3} textAnchor="end">{fmt(r.after)}</text>
      </g>,
    )
    cy += 4.6
    out.push(<line key={`rl${i}`} x1={x} y1={cy} x2={x + w} y2={cy} stroke="#000" strokeWidth={0.18} />)
  })
  if (unchanged) {
    out.push(<text key="unch" x={c1 + 2} y={cy + 3.3} fontSize={2.3}>без изменений: {unchanged}</text>)
    cy += 4.6
    out.push(<line key="unchl" x1={x} y1={cy} x2={x + w} y2={cy} stroke="#000" strokeWidth={0.18} />)
  }
  out.push(
    <g key="tot">
      <text x={c1 + 2} y={cy + 3.4} fontSize={2.4} fontWeight={700}>Итого</text>
      <text x={c3 - 1} y={cy + 3.4} fontSize={2.4} fontWeight={700} textAnchor="end">{fmt(summary.areaBefore)}</text>
      <text x={x + w - 1} y={cy + 3.4} fontSize={2.4} fontWeight={700} textAnchor="end">{fmt(summary.areaAfter)}</text>
    </g>,
  )
  cy += 5
  for (const [k, xx] of [["v1", c1], ["v2", c2], ["v3", c3]] as const) out.push(<line key={k} x1={xx} y1={top + 6} x2={xx} y2={cy} stroke="#000" strokeWidth={0.18} />)
  out.push(<rect key="box" x={x} y={top + 6} width={w} height={cy - top - 6} fill="none" stroke="#000" strokeWidth={0.5} />)
  cy += 4
  out.push(<text key="s1" x={x} y={cy + 2} fontSize={2.3}>Демонтаж стен {summary.demolishWallM.toFixed(1).replace(".", ",")} м, новые стены {summary.newWallM.toFixed(1).replace(".", ",")} м</text>)
  out.push(<text key="s2" x={x} y={cy + 6} fontSize={2.3}>Проёмы: пробиваются {summary.openingsNew}, закладываются {summary.openingsClosed}</text>)
  if (cut) out.push(<text key="cut" x={x} y={cy + 10} fontSize={2.2}>…ещё помещений: {cut}</text>)
  return <g>{out}</g>
}

/**
 * Лист «Общие данные» (ГОСТ 21.101): ведомость листов, технико-экономические
 * показатели, общие указания и условные обозначения.
 */
function CoverBody({ rows, w, indicators }: { rows: Array<{ no: number; title: string; note: string }>; w: number; indicators: BuildingIndicators | null }) {
  const x = 30, tw = Math.min(200, w - 210), y0 = 30, rh = 7
  const c1 = x + 13, c2 = x + tw - 48
  const rx = x + tw + 16, rw = Math.min(190, w - tw - 50)
  const fmt = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 1 })
  const tep: Array<[string, string]> = indicators
    ? [
        ["Этажность (надземных этажей)", String(indicators.above)],
        ["Количество этажей всего", String(indicators.floors)],
        ["Площадь застройки, м²", fmt(indicators.footprintM2)],
        ["Общая площадь помещений, м²", fmt(indicators.totalM2)],
        ["в т.ч. арендопригодная, м²", fmt(indicators.rentM2)],
        ["в т.ч. МОП и технические, м²", fmt(indicators.commonM2)],
        ["Строительный объём, м³", fmt(indicators.volumeM3)],
        ["Высота здания, м", fmt(indicators.heightM)],
      ]
    : []
  const notes = [
    "1. Чертежи выполнены в системе Commrent по обмерам и техническому паспорту здания.",
    "2. Размеры на планах даны в миллиметрах, отметки — в метрах.",
    "3. Площади помещений подсчитаны по внутренним граням стен за вычетом колонн.",
    "4. Места общего пользования и технические помещения в арендопригодную площадь не входят.",
    "5. Все изменения в планировке согласовать с проектной организацией.",
  ]
  const legend: Array<[string, "solid" | "demolish" | "new" | "column" | "door" | "exit"]> = [
    ["Существующие стены и перегородки", "solid"],
    ["Демонтируемые конструкции", "demolish"],
    ["Возводимые конструкции", "new"],
    ["Колонна", "column"],
    ["Дверной проём", "door"],
    ["Эвакуационный выход", "exit"],
  ]
  const out: React.ReactNode[] = []
  // ── ведомость листов ──
  out.push(<text key="t1" x={x + tw / 2} y={y0 - 5} fontSize={4} textAnchor="middle">Ведомость листов</text>)
  out.push(<rect key="b1" x={x} y={y0} width={tw} height={rh * (rows.length + 1)} fill="none" stroke="#000" strokeWidth={0.5} />)
  out.push(<line key="v1" x1={c1} y1={y0} x2={c1} y2={y0 + rh * (rows.length + 1)} stroke="#000" strokeWidth={0.5} />)
  out.push(<line key="v2" x1={c2} y1={y0} x2={c2} y2={y0 + rh * (rows.length + 1)} stroke="#000" strokeWidth={0.5} />)
  out.push(<line key="h1" x1={x} y1={y0 + rh} x2={x + tw} y2={y0 + rh} stroke="#000" strokeWidth={0.5} />)
  out.push(<text key="c1" x={x + 6.5} y={y0 + 4.8} fontSize={2.6} textAnchor="middle">Лист</text>)
  out.push(<text key="c2" x={(c1 + c2) / 2} y={y0 + 4.8} fontSize={2.6} textAnchor="middle">Наименование</text>)
  out.push(<text key="c3" x={(c2 + x + tw) / 2} y={y0 + 4.8} fontSize={2.6} textAnchor="middle">Примечание</text>)
  rows.forEach((r, i) => {
    const y = y0 + rh * (i + 1)
    out.push(
      <g key={`r${r.no}`}>
        <line x1={x} y1={y + rh} x2={x + tw} y2={y + rh} stroke="#000" strokeWidth={0.18} />
        <text x={x + 6.5} y={y + 4.8} fontSize={2.6} textAnchor="middle">{r.no}</text>
        <text x={c1 + 2.5} y={y + 4.8} fontSize={2.6}>{r.title}</text>
        <text x={c2 + 2.5} y={y + 4.8} fontSize={2.4}>{r.note}</text>
      </g>,
    )
  })
  // ── общие указания ──
  let cy = y0 + rh * (rows.length + 1) + 12
  out.push(<text key="t2" x={x} y={cy} fontSize={4}>Общие указания</text>)
  cy += 6
  notes.forEach((t, i) => {
    out.push(<text key={`n${i}`} x={x} y={cy} fontSize={2.8}>{t}</text>)
    cy += 5
  })
  // ── показатели ──
  if (tep.length) {
    const th = 6
    out.push(<text key="t3" x={rx + rw / 2} y={y0 - 5} fontSize={4} textAnchor="middle">Технико-экономические показатели</text>)
    out.push(<rect key="b3" x={rx} y={y0} width={rw} height={th * tep.length} fill="none" stroke="#000" strokeWidth={0.5} />)
    out.push(<line key="v3" x1={rx + rw - 40} y1={y0} x2={rx + rw - 40} y2={y0 + th * tep.length} stroke="#000" strokeWidth={0.5} />)
    tep.forEach(([label, value], i) => {
      const y = y0 + th * i
      out.push(
        <g key={`tep${i}`}>
          {i > 0 && <line x1={rx} y1={y} x2={rx + rw} y2={y} stroke="#000" strokeWidth={0.18} />}
          <text x={rx + 2.5} y={y + 4.1} fontSize={2.8}>{label}</text>
          <text x={rx + rw - 2.5} y={y + 4.1} fontSize={2.8} textAnchor="end" fontWeight={700}>{value}</text>
        </g>,
      )
    })
  }
  // ── условные обозначения ──
  let ly = y0 + 6 * tep.length + 18
  out.push(<text key="t4" x={rx} y={ly} fontSize={4}>Условные обозначения</text>)
  ly += 7
  legend.forEach(([label, kind], i) => {
    const y = ly + i * 8
    out.push(
      <g key={`lg${i}`}>
        {kind === "solid" && <rect x={rx} y={y - 3} width={18} height={3} fill="#000" />}
        {kind === "demolish" && <rect x={rx} y={y - 3} width={18} height={3} fill="none" stroke="#000" strokeWidth={0.3} strokeDasharray="2 1.4" />}
        {kind === "new" && <rect x={rx} y={y - 3} width={18} height={3} fill="url(#hatch-new)" stroke="#000" strokeWidth={0.3} />}
        {kind === "column" && <rect x={rx + 6} y={y - 4} width={6} height={5} fill="#000" />}
        {kind === "door" && (
          <g>
            <rect x={rx} y={y - 3} width={18} height={3} fill="#fff" stroke="#000" strokeWidth={0.3} />
            <path d={`M ${rx + 4} ${y} A 8 8 0 0 1 ${rx + 12} ${y - 7}`} fill="none" stroke="#000" strokeWidth={0.3} />
          </g>
        )}
        {kind === "exit" && (
          <g>
            <line x1={rx} y1={y - 1.5} x2={rx + 14} y2={y - 1.5} stroke="#16a34a" strokeWidth={0.9} />
            <polygon points={`${rx + 18},${y - 1.5} ${rx + 13},${y - 4} ${rx + 13},${y + 1}`} fill="#16a34a" />
          </g>
        )}
        <text x={rx + 24} y={y} fontSize={2.8}>{label}</text>
      </g>,
    )
  })
  return <g>{out}</g>
}

/** Экспликация помещений и ведомость заполнения проёмов (ГОСТ 21.501). */
function ArTables({ rooms, schedule, floorId, x, y, w, maxH }: { rooms: RoomRow[]; schedule: OpeningSchedule; floorId: string; x: number; y: number; w: number; maxH: number }) {
  const out: React.ReactNode[] = []
  let cy = y
  const limit = y + maxH
  const RH = 4.6
  const fmt = (v: number) => v.toFixed(1).replace(".", ",")
  const table = (key: string, title: string, cols: Array<{ w: number; label: string; align?: "end" | "middle" }>, rows: string[][], total?: string[]) => {
    if (!rows.length) return
    const top = cy
    out.push(<text key={`${key}t`} x={x + w / 2} y={cy + 4} fontSize={3} textAnchor="middle">{title}</text>)
    cy += 6
    const xs: number[] = []
    let acc = x
    for (const c of cols) { xs.push(acc); acc += c.w }
    const cellX = (i: number) => (cols[i].align === "end" ? xs[i] + cols[i].w - 1 : cols[i].align === "middle" ? xs[i] + cols[i].w / 2 : xs[i] + 1.2)
    const anchor = (i: number) => cols[i].align ?? "start"
    out.push(<line key={`${key}hl0`} x1={x} y1={cy} x2={x + w} y2={cy} stroke="#000" strokeWidth={0.5} />)
    cols.forEach((c, i) => out.push(<text key={`${key}h${i}`} x={cellX(i)} y={cy + 3.3} fontSize={2.2} textAnchor={anchor(i)}>{c.label}</text>))
    cy += 5
    out.push(<line key={`${key}hl1`} x1={x} y1={cy} x2={x + w} y2={cy} stroke="#000" strokeWidth={0.5} />)
    let cut = 0
    rows.forEach((r, ri) => {
      if (cy + RH > limit - 8) { cut++; return }
      r.forEach((cell, i) => {
        const maxChars = Math.floor((cols[i].w - 2) / 1.2)
        const t = cell.length > maxChars ? `${cell.slice(0, maxChars - 1)}…` : cell
        out.push(<text key={`${key}r${ri}c${i}`} x={cellX(i)} y={cy + 3.2} fontSize={2.2} textAnchor={anchor(i)}>{t}</text>)
      })
      cy += RH
      out.push(<line key={`${key}rl${ri}`} x1={x} y1={cy} x2={x + w} y2={cy} stroke="#000" strokeWidth={0.18} />)
    })
    if (total) {
      total.forEach((cell, i) => cell && out.push(<text key={`${key}tt${i}`} x={cellX(i)} y={cy + 3.3} fontSize={2.3} fontWeight={700} textAnchor={anchor(i)}>{cell}</text>))
      cy += 5
    }
    xs.slice(1).forEach((xx, i) => out.push(<line key={`${key}v${i}`} x1={xx} y1={top + 6} x2={xx} y2={cy} stroke="#000" strokeWidth={0.18} />))
    out.push(<rect key={`${key}box`} x={x} y={top + 6} width={w} height={cy - top - 6} fill="none" stroke="#000" strokeWidth={0.5} />)
    if (cut) { out.push(<text key={`${key}cut`} x={x} y={cy + 3} fontSize={2.1}>…ещё строк: {cut}</text>); cy += 4 }
    cy += 6
  }
  const total = rooms.reduce((sum, r) => sum + r.areaM2, 0)
  const rent = rooms.filter((r) => r.use === "rent").reduce((sum, r) => sum + r.areaM2, 0)
  // сначала арендопригодные, затем МОП и технические — с подытогами
  const ordered = [...rooms.filter((r) => r.use === "rent"), ...rooms.filter((r) => r.use !== "rent")]
  table("rooms", "Экспликация помещений", [{ w: 14, label: "№", align: "middle" }, { w: w - 34, label: "Наименование" }, { w: 20, label: "Площадь, м²", align: "end" }],
    [
      ...ordered.map((r) => [r.number || (r.use === "tech" ? "Т" : "МОП"), r.name || "Помещение", fmt(r.areaM2)]),
      ...(rent < total ? [["", "в т.ч. арендопригодная", fmt(rent)], ["", "в т.ч. МОП и технические", fmt(total - rent)]] : []),
    ], ["", "Итого", fmt(total)])
  const onFloor = schedule.rows.filter((r) => (r.perFloor[floorId] ?? 0) > 0)
  table("ops", "Ведомость заполнения проёмов", [{ w: 13, label: "Марка", align: "middle" }, { w: w - 41, label: "Наименование" }, { w: 14, label: "Этаж", align: "end" }, { w: 14, label: "Всего", align: "end" }],
    onFloor.map((r) => [r.mark, openingName(r), String(r.perFloor[floorId] ?? 0), String(r.total)]))
  return <g>{out}</g>
}
