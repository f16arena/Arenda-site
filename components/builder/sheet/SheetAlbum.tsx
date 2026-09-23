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
import { lintelSchedule } from "@/lib/builder/drawing/lintels"
import { buildRoofPlan } from "@/lib/builder/drawing/roof-plan"
import { buildSlabPlan } from "@/lib/builder/drawing/slab-plan"
import { buildSitePlan } from "@/lib/builder/drawing/site-plan"
import { buildDetails } from "@/lib/builder/drawing/details"
import { islandNames, projectIslandSchedule } from "@/lib/builder/islands"
import { floorRooms } from "@/lib/builder/rooms"
import { roomDisplayName } from "@/lib/builder/room-use"
import { buildFloorDrawing, pickSheet, type Sheet, type PlanStage } from "@/lib/builder/drawing/floor-drawing"
import { buildMepDrawing, sectionTitle, sectionsWithContent, type SheetSection } from "@/lib/builder/drawing/mep-drawing"
import { buildFacade, buildSection, facadeTitle } from "@/lib/builder/drawing/elevation"
import { hasReplan, replanSummary } from "@/lib/builder/replan"
import { pickElevationSheet } from "./ElevationSvg"
import { FACADES, STAGE_TITLE_KEY, SheetSvg, TABLES_W, autoSections, floorTitle, planExtras } from "./FloorSheet"
import { useT } from "@/lib/i18n/client"

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
  const { t } = useT()
  const entries = useMemo<Entry[]>(() => {
    const floors: Floor[] = [...building.floors].filter((f) => Object.keys(f.wallGraph.edges).length > 0).sort((a, b) => a.level - b.level)
    const num = (id: string) => premiseNumbers[id] ?? null
    const out: Entry[] = []
    const plan = (f: Floor, stage: PlanStage, section: SheetSection, title: string) => {
      const extras = planExtras(building.floors, f, num, t)
      const drawing = buildFloorDrawing(f, num, stage, { ...extras.options, t })
      const numbers = new Map(extras.rooms.map((r) => [r.roomId, r.number]))
      const mep = section !== "ar" ? buildMepDrawing(f, section, t, (rid) => numbers.get(rid) ?? null) : null
      const replan = stage !== "plan" && hasReplan(f) ? replanSummary(f) : null
      const withAr = stage === "plan" && section === "ar"
      const reserve = (mep && (mep.legend.length || mep.spec.length)) || replan || withAr ? TABLES_W + 5 : 0
      const sheet = pickSheet(drawing, reserve)
      out.push({
        key: `${f.id}-${stage}-${section}`, title, sheet,
        props: { drawing, sheet, title, section, mep, reserveRight: reserve, elevation: null, sectionMarks: withAr ? building.sections ?? [] : [], replan, stage, ar: withAr ? { rooms: extras.rooms, schedule: extras.schedule, floorId: f.id } : null },
      })
    }
    for (const f of floors) plan(f, "plan", "ar", floorTitle(t, f))
    // план эвакуации — на каждый этаж, сразу за планами
    for (const f of floors) {
      const extras = planExtras(building.floors, f, num, t)
      const drawing = buildFloorDrawing(f, num, "plan", { ...extras.options, t })
      const sheet = pickSheet(drawing, 0)
      const title = `${floorTitle(t, f)}${t("adminBuilderSheet.sheet.suffixEvac")}`
      out.push({
        key: `${f.id}-evac`, title, sheet,
        props: { drawing, sheet, title, section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", evac: buildEvacuation(f) },
      })
    }
    // ведомость отделки и экспликация полов — на каждый этаж
    for (const f of floors) {
      const extras = planExtras(building.floors, f, num, t)
      const numbers = new Map(extras.rooms.map((r) => [r.roomId, r.number]))
      const drawing = buildFloorDrawing(f, num, "plan", { ...extras.options, t })
      const title = `${floorTitle(t, f)}${t("adminBuilderSheet.sheet.suffixFinish")}`
      out.push({
        key: `${f.id}-finish`, title, sheet: A3L,
        props: { drawing, sheet: A3L, title, section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", finish: { rows: finishSchedule(f, t, numbers), types: floorTypes(f, t, numbers), lintels: lintelSchedule([f]) } },
      })
    }
    for (const f of floors) {
      if (!hasReplan(f)) continue
      for (const st of ["demolish", "install", "after"] as const) plan(f, st, "ar", `${floorTitle(t, f)}. ${t(`adminBuilderSheet.sheet.${STAGE_TITLE_KEY[st]}`)}`)
    }
    for (const f of floors) for (const sec of sectionsWithContent(f)) plan(f, "plan", sec, `${floorTitle(t, f)}. ${sec} — ${sectionTitle(t, sec).toLowerCase()}`)
    // генеральный план — первым листом после общих данных
    if (site) {
      const sp = buildSitePlan({ site, buildings: allBuildings ?? [building] })
      const base0 = floors[0]
      if (sp && base0) {
        const extras0 = planExtras(building.floors, base0, num, t)
        const drawing0 = buildFloorDrawing(base0, num, "plan", { ...extras0.options, t })
        out.push({
          key: "site-plan", title: t("adminBuilderSheet.sheet.viewSite"), sheet: A3L,
          props: { drawing: drawing0, sheet: A3L, title: t("adminBuilderSheet.sheet.viewSite"), section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", sitePlan: sp },
        })
      }
    }
    // ведомость арендных мест — один лист на здание, только если места есть
    {
      const rows = projectIslandSchedule(floors, site?.islands ?? [], (f) => floorRooms(f), (f, roomId) => {
        const r = floorRooms(f).find((x) => x.id === roomId)
        return r ? roomDisplayName(f, r, (key) => t(`adminBuilder.roomNames.${key}`)) : ""
      }, islandNames(t))
      const base = floors[0]
      if (rows.length && base) {
        const extras = planExtras(building.floors, base, num, t)
        const drawing = buildFloorDrawing(base, num, "plan", { ...extras.options, t })
        out.push({
          key: "islands", title: t("adminBuilderSheet.sheet.viewIslands"), sheet: A3L,
          props: { drawing, sheet: A3L, title: t("adminBuilderSheet.sheet.viewIslands"), section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", islands: rows },
        })
      }
    }
    // план перекрытия — на каждый этаж
    for (const f of floors) {
      const extras = planExtras(building.floors, f, num, t)
      const drawing = buildFloorDrawing(f, num, "plan", { ...extras.options, t })
      const sheet = pickSheet(drawing, 0)
      const title = `${floorTitle(t, f)}${t("adminBuilderSheet.sheet.suffixSlabs")}`
      out.push({
        key: `${f.id}-slabs`, title, sheet,
        props: { drawing, sheet, title, section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", slabPlan: buildSlabPlan(f) },
      })
    }
    // план кровли — один на здание, по верхнему этажу
    {
      const top = [...floors].sort((a, b) => b.elevation - a.elevation)[0]
      const rp = top ? buildRoofPlan(top) : null
      if (top && rp) {
        const extras = planExtras(building.floors, top, num, t)
        const drawing = buildFloorDrawing(top, num, "plan", { ...extras.options, t })
        const sheet = pickSheet(drawing, 0)
        out.push({
          key: "roof-plan", title: t("adminBuilderSheet.sheet.viewRoof"), sheet,
          props: { drawing, sheet, title: t("adminBuilderSheet.sheet.viewRoof"), section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", roofPlan: rp },
        })
      }
    }
    // узлы и фрагменты — один лист на здание
    {
      const dets = buildDetails({ floors }, t)
      const base0 = floors[0]
      if (dets.length && base0) {
        const drawing = buildFloorDrawing(base0, num, "plan", { t })
        const sheet = { w: 594, h: 420, scale: 20, format: "A2", orientation: "landscape" } as const
        out.push({
          key: "details", title: t("adminBuilderSheet.sheet.viewDetails"), sheet,
          props: { drawing, sheet, title: t("adminBuilderSheet.sheet.viewDetails"), section: "ar", mep: null, reserveRight: 0, elevation: null, sectionMarks: [], replan: null, stage: "plan", details: dets },
        })
      }
    }
    const base = floors[0]
    if (base) {
      const drawing = buildFloorDrawing(base, num, "plan", { t })
      const views = [
        ...FACADES.map((side) => ({ key: `facade-${side}`, title: facadeTitle(t, side), d: buildFacade(building, side, t) })),
        ...((building.sections ?? []).length ? building.sections : autoSections(floors)).map((sec) => ({ key: `section-${sec.id}`, title: t("adminBuilderSheet.sheet.sectionOf", { name: sec.name }), d: buildSection(building, sec, t) })),
      ]
      for (const v of views) {
        if (!v.d.items.length) continue
        const sheet = pickElevationSheet(v.d)
        out.push({ key: v.key, title: v.title, sheet, props: { drawing, sheet, title: v.title, section: "ar", mep: null, reserveRight: 0, elevation: v.d, sectionMarks: [], replan: null, stage: "plan" } })
      }
    }
    return out
  }, [building, premiseNumbers, site, allBuildings, t])

  // Альбом живёт в собственном слое прямо в body: оболочка админки фиксирует
  // высоту экрана, и печать из неё обрезалась бы на первом листе
  const [host] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null
    const el = document.createElement("div")
    el.id = "sheet-album-root"
    return el
  })
  useEffect(() => {
    if (!host) return
    document.body.appendChild(host)
    return () => {
      host.parentNode?.removeChild(host)
    }
  }, [host])
  const total = entries.length + 1
  const coverRows = entries.map((e, i) => ({ no: i + 2, title: e.title, note: `${e.sheet.format}, ${t("adminBuilderSheet.sheet.scaleMark", { scale: e.sheet.scale })}` }))
  const firstFloor = building.floors.find((f) => Object.keys(f.wallGraph.edges).length > 0)
  const pageName = (s: Sheet) => `${s.format}${s.orientation === "landscape" ? "L" : "P"}`

  if (!firstFloor) return <div className="p-6 text-sm text-slate-500">{t("adminBuilderSheet.sheet.albumEmpty")}</div>
  const coverDrawing = buildFloorDrawing(firstFloor, undefined, "plan", { t })
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
          <ArrowLeft className="h-3.5 w-3.5" /> {t("adminBuilderSheet.sheet.singleSheet")}
        </Link>
        <span className="text-xs text-slate-500">{t("adminBuilderSheet.sheet.albumCount", { count: total })}</span>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900" title={t("adminBuilderSheet.sheet.albumPdfHint")}>
          <Printer className="h-3.5 w-3.5" /> {t("adminBuilderSheet.sheet.albumPdf")}
        </button>
      </div>
      <div id="sheet-album" className="flex flex-col gap-6">
        <div className={`album-page pg-A3L`}>
          <SheetSvg svgId="album-cover" drawing={coverDrawing} sheet={A3L} title={t("adminBuilderSheet.sheet.common")} buildingName={buildingName} address={address} author={author} sheetNo={1} sheetCount={total} section="ar" mep={null} reserveRight={0} elevation={null} sectionMarks={[]} replan={null} stage="plan" cover={coverRows} indicators={buildingIndicators(building, site ? ((site.sizeX ?? 50000) / 1000) * ((site.sizeZ ?? 50000) / 1000) : undefined)} />
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
