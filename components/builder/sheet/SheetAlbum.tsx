"use client"

// Альбом рабочих чертежей: все листы проекта подряд со сквозной нумерацией —
// ведомость, планы этажей, перепланировка, сети по разделам, фасады, разрезы.
// Печать одним заданием: каждый лист на своей странице своего формата.

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, Printer } from "lucide-react"
import type { Building, BuilderDocument, Floor } from "@/types/builder"
import { buildingIndicators } from "@/lib/builder/drawing/indicators"
import { buildEvacuation } from "@/lib/builder/drawing/evacuation"
import { finishSchedule, floorTypes } from "@/lib/builder/drawing/finish"
import { buildRoofPlan } from "@/lib/builder/drawing/roof-plan"
import { buildSitePlan } from "@/lib/builder/drawing/site-plan"
import { buildFloorDrawing, pickSheet, type Sheet, type PlanStage } from "@/lib/builder/drawing/floor-drawing"
import { buildMepDrawing, SECTION_TITLE, sectionsWithContent, type SheetSection } from "@/lib/builder/drawing/mep-drawing"
import { FACADE_TITLE, buildFacade, buildSection } from "@/lib/builder/drawing/elevation"
import { hasReplan, replanSummary } from "@/lib/builder/replan"
import { pickElevationSheet } from "./ElevationSvg"
import { FACADES, STAGE_TITLE, SheetSvg, TABLES_W, autoSections, floorTitle, planExtras } from "./FloorSheet"

type Entry = { key: string; title: string; sheet: Sheet; props: Omit<Parameters<typeof SheetSvg>[0], "sheetNo" | "sheetCount" | "buildingName" | "address" | "author"> }

const A3L: Sheet = { w: 420, h: 297, scale: 100, format: "A3", orientation: "landscape" }

export function SheetAlbum({ buildingId, buildingName, address, author, building, premiseNumbers, site, allBuildings }: {
  buildingId: string
  buildingName: string
  address: string
  author: string
  building: Building
  premiseNumbers: Record<string, string>
  /** участок проекта — лист генерального плана */
  site?: BuilderDocument["site"]
  allBuildings?: Building[]
}) {
  const entries = useMemo<Entry[]>(() => {
    const floors: Floor[] = [...building.floors].filter((f) => Object.keys(f.wallGraph.edges).length > 0).sort((a, b) => a.level - b.level)
    const num = (id: string) => premiseNumbers[id] ?? null
    const out: Entry[] = []
    const plan = (f: Floor, stage: PlanStage, section: SheetSection, title: string) => {
      const extras = planExtras(building.floors, f, num)
      const drawing = buildFloorDrawing(f, num, stage, extras.options)
      const numbers = new Map(extras.rooms.map((r) => [r.roomId, r.number]))
      const mep = section !== "ar" ? buildMepDrawing(f, section, (rid) => numbers.get(rid) ?? null) : null
      const replan = stage !== "plan" && hasReplan(f) ? replanSummary(f) : null
      const withAr = stage === "plan" && section === "ar"
      const reserve = (mep && (mep.legend.length || mep.spec.length)) || replan || withAr ? TABLES_W + 5 : 0
      const sheet = pickSheet(drawing, reserve)
      out.push({
        key: `${f.id}-${stage}-${section}`, title, sheet,
        props: { drawing, sheet, title, section, mep, reserveRight: reserve, elevation: null, sectionMarks: withAr ? building.sections ?? [] : [], replan, stage, ar: withAr ? { rooms: extras.rooms, schedule: extras.schedule, floorId: f.id } : null },
      })
    }
    for (const f of floors) plan(f, "plan", "ar", floorTitle(f))
    // план эвакуации — на каждый этаж, сразу за планами
    for (const f of floors) {
      const extras = planExtras(building.floors, f, num)
      const drawing = buildFloorDrawing(f, num, "plan", extras.options)
      const sheet = pickSheet(drawing, 0)
      const title = `${floorTitle(f)}. План эвакуации`
      out.push({
        key: `${f.id}-evac`, title, sheet,
        props: { drawing, sheet, title, section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", evac: buildEvacuation(f) },
      })
    }
    // ведомость отделки и экспликация полов — на каждый этаж
    for (const f of floors) {
      const extras = planExtras(building.floors, f, num)
      const numbers = new Map(extras.rooms.map((r) => [r.roomId, r.number]))
      const drawing = buildFloorDrawing(f, num, "plan", extras.options)
      const title = `${floorTitle(f)}. Ведомость отделки помещений`
      out.push({
        key: `${f.id}-finish`, title, sheet: A3L,
        props: { drawing, sheet: A3L, title, section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", finish: { rows: finishSchedule(f, numbers), types: floorTypes(f, numbers) } },
      })
    }
    for (const f of floors) {
      if (!hasReplan(f)) continue
      for (const st of ["demolish", "install", "after"] as const) plan(f, st, "ar", `${floorTitle(f)}. ${STAGE_TITLE[st]}`)
    }
    for (const f of floors) for (const sec of sectionsWithContent(f)) plan(f, "plan", sec, `${floorTitle(f)}. ${sec} — ${SECTION_TITLE[sec].toLowerCase()}`)
    // генеральный план — первым листом после общих данных
    if (site) {
      const sp = buildSitePlan({ site, buildings: allBuildings ?? [building] })
      const base0 = floors[0]
      if (sp && base0) {
        const extras0 = planExtras(building.floors, base0, num)
        const drawing0 = buildFloorDrawing(base0, num, "plan", extras0.options)
        out.push({
          key: "site-plan", title: "Генеральный план", sheet: A3L,
          props: { drawing: drawing0, sheet: A3L, title: "Генеральный план", section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", sitePlan: sp },
        })
      }
    }
    // план кровли — один на здание, по верхнему этажу
    {
      const top = [...floors].sort((a, b) => b.elevation - a.elevation)[0]
      const rp = top ? buildRoofPlan(top) : null
      if (top && rp) {
        const extras = planExtras(building.floors, top, num)
        const drawing = buildFloorDrawing(top, num, "plan", extras.options)
        const sheet = pickSheet(drawing, 0)
        out.push({
          key: "roof-plan", title: "План кровли", sheet,
          props: { drawing, sheet, title: "План кровли", section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", roofPlan: rp },
        })
      }
    }
    const base = floors[0]
    if (base) {
      const drawing = buildFloorDrawing(base, num)
      const views = [
        ...FACADES.map((side) => ({ key: `facade-${side}`, title: FACADE_TITLE[side], d: buildFacade(building, side) })),
        ...((building.sections ?? []).length ? building.sections : autoSections(floors)).map((s) => ({ key: `section-${s.id}`, title: `Разрез ${s.name}`, d: buildSection(building, s) })),
      ]
      for (const v of views) {
        if (!v.d.items.length) continue
        const sheet = pickElevationSheet(v.d)
        out.push({ key: v.key, title: v.title, sheet, props: { drawing, sheet, title: v.title, section: "ar", mep: null, reserveRight: 0, elevation: v.d, sectionMarks: [], replan: null, stage: "plan" } })
      }
    }
    return out
  }, [building, premiseNumbers, site, allBuildings])

  // Альбом живёт в собственном слое прямо в body: оболочка админки фиксирует
  // высоту экрана, и печать из неё обрезалась бы на первом листе
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const el = document.createElement("div")
    el.id = "sheet-album-root"
    document.body.appendChild(el)
    setHost(el)
    return () => el.remove()
  }, [])
  const total = entries.length + 1
  const coverRows = entries.map((e, i) => ({ no: i + 2, title: e.title, note: `${e.sheet.format}, М 1:${e.sheet.scale}` }))
  const firstFloor = building.floors.find((f) => Object.keys(f.wallGraph.edges).length > 0)
  const pageName = (s: Sheet) => `${s.format}${s.orientation === "landscape" ? "L" : "P"}`

  if (!firstFloor) return <div className="p-6 text-sm text-slate-500">В модели здания нет этажей — альбом пуст.</div>
  const coverDrawing = buildFloorDrawing(firstFloor)
  if (!host) return null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col gap-3 overflow-auto bg-slate-100 p-4 dark:bg-slate-900 print:static print:overflow-visible print:bg-white print:p-0">
      <style>{`
        @page A3L { size: 420mm 297mm; margin: 0 }
        @page A3P { size: 297mm 420mm; margin: 0 }
        @page A2L { size: 594mm 420mm; margin: 0 }
        @page A2P { size: 420mm 594mm; margin: 0 }
        @media print {
          body > *:not(#sheet-album-root) { display: none !important }
          #sheet-album-root > div { position: static !important; overflow: visible !important }
          #sheet-album { gap: 0 }
          .album-page { break-after: page; margin: 0 }
          html, body { margin: 0 !important; padding: 0 !important }
          .album-page { overflow: hidden; line-height: 0 }
          .album-page svg { max-width: none !important; height: auto }
          .pg-A3L { page: A3L } .pg-A3P { page: A3P } .pg-A2L { page: A2L } .pg-A2P { page: A2P }
        }
      `}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/admin/builder/${buildingId}/sheet`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Отдельный лист
        </Link>
        <span className="text-xs text-slate-500">Альбом: {total} листов</span>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900" title="В окне печати — «Сохранить как PDF»: каждый лист на странице своего формата">
          <Printer className="h-3.5 w-3.5" /> PDF альбома
        </button>
      </div>
      <div id="sheet-album" className="flex flex-col gap-6">
        <div className={`album-page pg-A3L`}>
          <SheetSvg svgId="album-cover" drawing={coverDrawing} sheet={A3L} title="Общие данные" buildingName={buildingName} address={address} author={author} sheetNo={1} sheetCount={total} section="ar" mep={null} reserveRight={0} elevation={null} sectionMarks={[]} replan={null} stage="plan" cover={coverRows} indicators={buildingIndicators(building)} />
        </div>
        {entries.map((e, i) => (
          <div key={e.key} className={`album-page pg-${pageName(e.sheet)}`}>
            <SheetSvg svgId={`album-${i + 2}`} {...e.props} buildingName={buildingName} address={address} author={author} sheetNo={i + 2} sheetCount={total} />
          </div>
        ))}
      </div>
    </div>,
    host,
  )
}
