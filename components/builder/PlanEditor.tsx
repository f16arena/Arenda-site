"use client"

// Редактор плана этажа — второй способ редактировать тот же проект.
//
// Чертёж в SVG (как лист, но живой): стены заливкой, двери с дугами, окна,
// лестницы со стрелкой хода, лифты, выходы, помещения со статусом аренды,
// размеры и надписи. Правки идут теми же командами, что и в 3D: открыли
// «3D» — там уже всё построено; поправили в 3D — план это показывает.
//
// Перетаскивание — предпросмотр без записи в историю, команда одна на жест:
// Ctrl+Z отменяет весь сдвиг целиком.

import { floorRooms } from "@/lib/builder/rooms"
import { useEffect, useMemo, useRef, useState } from "react"
import { useDocumentStore, useEditorStore, type Selection } from "@/store/builder-store"
import { usePremiseStore } from "@/store/premise-store"
import {
  findFloor,
  AddAnnotationCommand,
  AddOpeningCommand,
  AddRoomCommand,
  AddStairCommand,
  DeleteAnnotationCommand,
  DeleteMepDeviceCommand,
  DeleteStairCommand,
  InsertWallCommand,
  MoveNodeCommand,
  MoveOpeningCommand,
  MoveStairCommand,
  MoveWallCommand,
  replanDeleteOpening,
  replanDeleteWall,
  AddMepRunCommand,
  AddMepDeviceCommand,
  AddSectionCommand,
  nextSectionName,
  SetWallPropsCommand,
  SetOpeningSizeCommand,
  SetStairCommand,
  setColumnSizeCommand,
  MoveObjectCommand,
  AddObjectCommand,
  CompositeCommand,
  type Command,
} from "@/core/document/commands"
import { MEP_DEVICE_BY_KIND, deviceHeight, polylineLengthMm } from "@/lib/builder/mep/catalog"
import { snapMepPoint, wallMount } from "@/lib/builder/mep/snap"
import { DEFAULT_WALL } from "@/core/geometry/wall-graph"
import { closestOnSegment, type Vec2 } from "@/core/geometry/math"
import { detectRooms } from "@/core/geometry/room-detection"
import { uid } from "@/core/id"
import type { Floor } from "@/types/builder"
import { buildFloorDrawing } from "@/lib/builder/drawing/floor-drawing"
import { openingSchedule, roomExplication } from "@/lib/builder/drawing/schedules"
import { dimGeometry, signedOffset } from "@/lib/builder/annotations"
import { curtainSize, findPreset, isCurtain, sameWallOnFloor } from "@/lib/builder/openings"
import { MEP_SYSTEM_INFO } from "@/lib/builder/mep/catalog"
import { STATUS_COLOR, TOKENS } from "@/lib/builder/materials"
import { shortTenantName } from "@/lib/indoor-map/display-name"
import { stairHoleWorld } from "@/lib/builder/stair-hole"
import { stairRise } from "@/core/geometry/stair-generator"
import { insideBuilding, pointInObject, objectCorners, objectFootprint, snapColumn, spanAt, fitView, hitTest, perpendicularDelta, snapPoint, toPlan, toScreen, wallsInRect, zoomAt, type Hit, type Snap, type View } from "@/lib/builder/plan-editor-math"

type Drag =
  | { kind: "pan"; sx: number; sy: number; view: View; moved: boolean }
  | { kind: "wall"; id: string; from: Vec2; moved: boolean; sx: number; sy: number }
  | { kind: "node"; id: string; moved: boolean; sx: number; sy: number }
  | { kind: "opening"; id: string; moved: boolean; sx: number; sy: number }
  | { kind: "stair"; id: string; from: Vec2; origin: Vec2; moved: boolean; sx: number; sy: number }
  | { kind: "object"; id: string; from: Vec2; origin: Vec2; moved: boolean; sx: number; sy: number }
  | { kind: "room"; start: Vec2 }
  | { kind: "click"; hit: Hit | null; sx: number; sy: number; view: View; moved: boolean }
  | { kind: "box"; sx: number; sy: number; additive: boolean; moved: boolean }

const MOVE_PX = 4

/** Поля «вписать» с учётом панелей конструктора: этажи слева, свойства справа, тулбар сверху. */
function fitPad(w: number) {
  // + место под три размерные цепочки и оси с кружками (~140 px) с каждой стороны
  return w < 900 ? 40 : { left: 360, right: 360, top: 215, bottom: 175 }
}

export function PlanEditor() {
  const doc = useDocumentStore((s) => s.doc)
  const execute = useDocumentStore((s) => s.execute)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const siteFloorId = useEditorStore((s) => s.siteFloorId)
  const tool = useEditorStore((s) => s.activeTool)
  const selection = useEditorStore((s) => s.selection)
  const setSelection = useEditorStore((s) => s.setSelection)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const replanMode = useEditorStore((s) => s.replanMode)
  const openingType = useEditorStore((s) => s.openingType)
  const openingVariant = useEditorStore((s) => s.openingVariant)
  const stairShape = useEditorStore((s) => s.stairShape)
  const armedAsset = useEditorStore((s) => s.armedAsset)
  const columnSizeAll = useEditorStore((s) => s.columnSizeAll)
  const annotateKind = useEditorStore((s) => s.annotateKind)
  const multi = useEditorStore((s) => s.multi)
  const mepSystem = useEditorStore((s) => s.mepSystem)
  const mepDeviceKind = useEditorStore((s) => s.mepDeviceKind)
  const resolvePremise = usePremiseStore((s) => s.resolve)

  // на участке план показывает этаж выбранного элемента: окно третьего этажа
  // правится без переключения уровня
  const floor =
    activeLevelId && activeLevelId !== "site"
      ? findFloor(doc, activeLevelId)
      : (siteFloorId ? findFloor(doc, siteFloorId) : undefined) ?? doc.buildings[0]?.floors[0]
  const building = doc.buildings.find((b) => b.floors.some((f) => f.id === floor?.id))

  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1200, h: 800 })
  const [view, setView] = useState<View | null>(null)
  const [preview, setPreview] = useState<Floor | null>(null)
  const [cursor, setCursor] = useState<{ screen: Vec2; plan: Vec2; snap: Snap | null } | null>(null)
  const [chain, setChain] = useState<Vec2 | null>(null) // начало следующей стены
  const [dimPts, setDimPts] = useState<Vec2[]>([])
  const [lengthInput, setLengthInput] = useState("")
  const drag = useRef<Drag | null>(null)
  const [roomRect, setRoomRect] = useState<{ a: Vec2; b: Vec2 } | null>(null)
  const [boxRect, setBoxRect] = useState<{ a: Vec2; b: Vec2 } | null>(null) // экранные px
  const [hover, setHover] = useState<Hit | null>(null)
  const [pts2, setPts2] = useState<Vec2[]>([]) // рулетка, разрез, трасса сети
  const [measured, setMeasured] = useState<{ a: Vec2; b: Vec2 } | null>(null)
  // «Чертёж» — как лист АР (размеры, оси, марки, белый лист); «Аренда» — статусы и арендаторы
  const [look, setLook] = useState<"draft" | "rent">("draft")
  // размер у выделенного элемента, который сейчас правится с клавиатуры
  const [editing, setEditing] = useState<{ key: string; draft: string } | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  // короткое предупреждение под курсором: «так ставить нельзя»
  const [outsideHint, setOutsideHint] = useState<string | null>(null)
  useEffect(() => {
    if (!outsideHint) return
    const t = setTimeout(() => setOutsideHint(null), 2500)
    return () => clearTimeout(t)
  }, [outsideHint])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const shown = preview ?? floor ?? null
  const rooms = useMemo(() => (shown ? floorRooms(shown) : []), [shown])
  const numbers = useMemo(() => {
    if (!shown) return new Map<string, string>()
    return new Map(roomExplication(shown, (id) => resolvePremise(id)?.number ?? null).map((r) => [r.roomId, r.number]))
  }, [shown, resolvePremise])
  const marks = useMemo(() => {
    const floors = (building?.floors ?? []).map((f) => (preview && f.id === preview.id ? preview : f))
    return openingSchedule(floors).marks
  }, [building, preview])
  const drawing = useMemo(() => (shown ? buildFloorDrawing(shown, (id) => resolvePremise(id)?.number ?? null, "edit", { roomNumbers: numbers, openingMarks: marks }) : null), [shown, resolvePremise, numbers, marks])

  // вписать этаж при смене этажа и первом показе
  const fittedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!drawing || !floor || size.w < 50) return
    if (fittedFor.current === floor.id && view) return
    fittedFor.current = floor.id
    setView(fitView(drawing.bounds, size.w, size.h, fitPad(size.w)))
  }, [drawing, floor, size, view])

  // вид — для стенда проверок (вне прода), чтобы кликать в точные координаты плана
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __planView?: View | null; __detectRooms?: typeof detectRooms }
      w.__planView = view
      w.__detectRooms = detectRooms
    }
  }, [view])

  // смена инструмента сбрасывает незаконченный ввод
  useEffect(() => {
    setChain(null)
    setDimPts([])
    setLengthInput("")
    setRoomRect(null)
    setPts2([])
    setMeasured(null)
    setHover(null)
  }, [tool, activeLevelId])

  const v = view
  const tolMm = v ? 10 / v.k : 100
  const selectedWall = selection.type === "wall" && selection.floorId === floor?.id ? selection.id : undefined
  const gripNodes = useMemo(() => {
    const e = selectedWall && floor ? floor.wallGraph.edges[selectedWall] : undefined
    return e ? [e.a, e.b] : []
  }, [selectedWall, floor])

  function wallDefaults() {
    return replanMode ? { ...DEFAULT_WALL, phase: "new" as const } : DEFAULT_WALL
  }

  function selectHit(hit: Hit | null) {
    if (!floor) return
    const fid = floor.id
    if (!hit) return setSelection({ type: "none" })
    const map: Record<Hit["kind"], Selection["type"]> = { node: "node", opening: "opening", stair: "stair", annotation: "annotation", "mep-device": "mep-device", wall: "wall", room: "room", object: "object" }
    setSelection({ type: map[hit.kind], id: hit.id, floorId: fid })
  }

  function planAt(e: React.PointerEvent | React.WheelEvent): { s: Vec2; p: Vec2 } | null {
    const el = hostRef.current
    if (!el || !v) return null
    const r = el.getBoundingClientRect()
    const s = { x: e.clientX - r.left, y: e.clientY - r.top }
    return { s, p: toPlan(v, s) }
  }

  function commitWall(to: Vec2) {
    if (!floor || !chain) return
    if (Math.hypot(to.x - chain.x, to.y - chain.y) < 50) return
    execute(new InsertWallCommand(floor.id, chain, to, wallDefaults()))
    setChain(to)
    setLengthInput("")
  }

  function placeOpening(p: Vec2) {
    if (!floor) return
    const hit = hitTest(floor, p, tolMm)
    const wallId = hit?.kind === "wall" ? hit.id : hit?.kind === "opening" ? floor.openings.find((o) => o.id === hit.id)?.wallId : undefined
    const e = wallId ? floor.wallGraph.edges[wallId] : undefined
    const a = e && floor.wallGraph.nodes[e.a], b = e && floor.wallGraph.nodes[e.b]
    if (!e || !a || !b || !wallId) return
    const type = tool === "window" ? "window" : "door"
    const spec = findPreset(type, tool === openingType ? openingVariant : type === "window" ? "standard" : "interior")
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    // витраж занимает стену целиком — размеры считаем по самой стене
    if (isCurtain(spec.variant)) {
      const cmds: Command[] = []
      const add = (fl: typeof floor, wid: string, len: number) => {
        const cur = curtainSize(len, fl.wallGraph.edges[wid].height)
        cmds.push(new AddOpeningCommand(fl.id, { id: uid("op"), wallId: wid, type: "window" as const, variant: "curtain", width: cur.width, height: cur.height, sillHeight: cur.sill, offset: cur.offset, ...(replanMode ? { phase: "new" as const } : {}) }))
      }
      add(floor, wallId, L)
      if (spec.variant === "curtain-all") {
        // та же стена на остальных этажах — лента остекления снизу доверху
        for (const fl of building?.floors ?? []) {
          if (fl.id === floor.id) continue
          const twin = sameWallOnFloor(fl.wallGraph, a, b)
          if (!twin) continue
          const ta = fl.wallGraph.nodes[fl.wallGraph.edges[twin].a], tb = fl.wallGraph.nodes[fl.wallGraph.edges[twin].b]
          add(fl, twin, Math.hypot(tb.x - ta.x, tb.y - ta.y))
        }
      }
      execute(cmds.length === 1 ? cmds[0] : new CompositeCommand("витраж", cmds))
      return
    }
    if (L < spec.width + 200) return
    const t = closestOnSegment(p, a, b).t
    const offset = Math.round(Math.max(spec.width / 2 + 50, Math.min(L - spec.width / 2 - 50, t * L)))
    execute(new AddOpeningCommand(floor.id, { id: uid("op"), wallId, type, variant: spec.variant, width: spec.width, height: spec.height, sillHeight: spec.sill, offset, ...(replanMode ? { phase: "new" as const } : {}) }))
  }

  function placeStair(p: Vec2) {
    if (!floor || !building) return
    const upper = building.floors.filter((fl) => fl.elevation > floor.elevation).sort((x, y) => x.elevation - y.elevation)[0]
    if (stairShape === "porch" || stairShape === "ramp") {
      // крыльцо и пандус — к ближайшей стене снаружи, спуском от здания
      let best: { d: number; q: Vec2; n: Vec2; th: number } | null = null
      for (const e of Object.values(floor.wallGraph.edges)) {
        const a = floor.wallGraph.nodes[e.a], b = floor.wallGraph.nodes[e.b]
        if (!a || !b) continue
        const c = closestOnSegment(p, a, b)
        if (best && c.dist >= best.d) continue
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
        let n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }
        if ((p.x - c.point.x) * n.x + (p.y - c.point.y) * n.y < 0) n = { x: -n.x, y: -n.y }
        best = { d: c.dist, q: c.point, n, th: e.thickness }
      }
      if (!best) return
      const position = { x: Math.round(best.q.x + (best.n.x * best.th) / 2), y: Math.round(best.q.y + (best.n.y * best.th) / 2) }
      const rise = floor.elevation >= 150 && floor.elevation <= 2000 ? Math.round(floor.elevation) : 450
      const ramp = stairShape === "ramp"
      execute(new AddStairCommand(floor.id, {
        id: uid("st"),
        shape: ramp ? "ramp" : "porch",
        fromFloorId: floor.id,
        toFloorId: floor.id,
        position,
        rotationDeg: Math.round((Math.atan2(best.n.x, best.n.y) * 180) / Math.PI),
        // пандус по СП 59.13330 — не уже 1000 мм в свету, берём 1200
        width: ramp ? 1200 : 1800,
        railing: ramp,
        rise,
      }))
      return
    }
    if (stairShape === "column") {
      // в одну линию с другими колоннами (центр по X/Y), иначе сетка 50 мм
      const at = snapColumn(floor, p, tolMm, undefined, snapEnabled ? 50 : 0).p
      execute(new AddStairCommand(floor.id, { id: uid("st"), shape: "column", fromFloorId: floor.id, toFloorId: floor.id, position: at, rotationDeg: 0, width: 500, depth: 500, railing: false }))
      return
    }
    // лестница и лифт — только внутри здания: клик мимо создавал лестницу в поле
    if (!insideBuilding(floor, p)) {
      setOutsideHint(stairShape === "elevator" ? "Лифт ставится внутри здания" : "Лестница ставится внутри здания; снаружи — «Крыльцо»")
      return
    }
    const width = stairShape === "elevator" ? 2000 : 1100
    execute(new AddStairCommand(floor.id, { id: uid("st"), shape: stairShape, fromFloorId: floor.id, toFloorId: upper?.id ?? floor.id, position: { x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 }, rotationDeg: 0, width, railing: stairShape !== "elevator" }))
  }

  function deleteHit(hit: Hit | null) {
    if (!floor || !hit) return
    let cmd: Command | null = null
    if (hit.kind === "wall") cmd = replanDeleteWall(doc, floor.id, hit.id, replanMode)
    else if (hit.kind === "opening") cmd = replanDeleteOpening(doc, floor.id, hit.id, replanMode)
    else if (hit.kind === "stair") cmd = new DeleteStairCommand(floor.id, hit.id)
    else if (hit.kind === "annotation") cmd = new DeleteAnnotationCommand(floor.id, hit.id)
    else if (hit.kind === "mep-device") cmd = new DeleteMepDeviceCommand(floor.id, hit.id)
    if (cmd) execute(cmd)
    setSelection({ type: "none" })
  }

  // ── мышь ──────────────────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    const at = planAt(e)
    if (!at || !v || !floor) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (e.button === 1 || e.button === 2) {
      drag.current = { kind: "pan", sx: at.s.x, sy: at.s.y, view: v, moved: false }
      return
    }
    if (e.button !== 0) return
    if (tool === "room") {
      const sp = snapPoint(floor, at.p, null, tolMm, snapEnabled).p
      drag.current = { kind: "room", start: sp }
      setRoomRect({ a: sp, b: sp })
      return
    }
    if (tool === "select") {
      const hit = hitTest(floor, at.p, tolMm, gripNodes)
      const selId = selection.id
      if (hit?.kind === "node") { drag.current = { kind: "node", id: hit.id, moved: false, sx: at.s.x, sy: at.s.y }; return }
      if (hit && hit.id === selId && hit.kind === "wall") { drag.current = { kind: "wall", id: hit.id, from: at.p, moved: false, sx: at.s.x, sy: at.s.y }; return }
      if (hit && hit.id === selId && hit.kind === "opening") { drag.current = { kind: "opening", id: hit.id, moved: false, sx: at.s.x, sy: at.s.y }; return }
      if (hit && hit.id === selId && hit.kind === "object") {
        const ob = floor.objects.find((x) => x.id === hit.id)
        if (ob && !ob.locked) { drag.current = { kind: "object", id: hit.id, from: at.p, origin: { x: ob.position.x, y: ob.position.z }, moved: false, sx: at.s.x, sy: at.s.y }; return }
      }
      if (hit && hit.id === selId && hit.kind === "stair") {
        const st = floor.stairs.find((x) => x.id === hit.id)
        if (st) { drag.current = { kind: "stair", id: hit.id, from: at.p, origin: { ...st.position }, moved: false, sx: at.s.x, sy: at.s.y }; return }
      }
    }
    const hit0 = tool === "select" || tool === "delete" ? hitTest(floor, at.p, tolMm, gripNodes) : null
    if (tool === "select" && e.shiftKey && hit0?.kind === "wall") {
      // Shift+клик — добавить стену к набору (или убрать)
      const st = useEditorStore.getState()
      if (st.selection.type === "wall" && st.selection.id && !st.multi.includes(st.selection.id)) st.setMulti([st.selection.id])
      useEditorStore.getState().toggleMulti(hit0.id)
      drag.current = null
      return
    }
    if (tool === "select" && (!hit0 || hit0.kind === "room")) {
      // пустое место или помещение: протяжка — рамка, клик — выбор помещения/снятие выделения
      drag.current = { kind: "box", sx: at.s.x, sy: at.s.y, additive: e.shiftKey, moved: false }
      pendingHit.current = hit0
      return
    }
    drag.current = { kind: "click", hit: hit0, sx: at.s.x, sy: at.s.y, view: v, moved: false }
  }
  const pendingHit = useRef<Hit | null>(null)

  function onPointerMove(e: React.PointerEvent) {
    const at = planAt(e)
    if (!at || !v || !floor) return
    const d = drag.current
    const drawing = tool === "wall" || tool === "annotate" || tool === "room" || tool === "measure"
    const prev = tool === "wall" ? chain : tool === "annotate" && dimPts.length === 1 ? dimPts[0] : tool === "measure" ? pts2[0] ?? null : null
    const columnTool = tool === "stair" && stairShape === "column"
    const snap = drawing ? snapPoint(floor, at.p, prev, tolMm, snapEnabled && !e.altKey) : columnTool && !e.altKey ? snapColumn(floor, at.p, tolMm, undefined, snapEnabled ? 50 : 0) : null
    setCursor({ screen: at.s, plan: at.p, snap })
    if (!d && (tool === "select" || tool === "delete" || tool === "door" || tool === "window")) {
      const h = hitTest(floor, at.p, tolMm, gripNodes)
      setHover((old) => (old?.id === h?.id && old?.kind === h?.kind ? old : h))
    }
    if (!d) return
    if (d.kind === "box") {
      if (!d.moved && Math.hypot(at.s.x - d.sx, at.s.y - d.sy) <= MOVE_PX) return
      d.moved = true
      setBoxRect({ a: { x: d.sx, y: d.sy }, b: at.s })
      return
    }
    const far = Math.hypot(at.s.x - ("sx" in d ? d.sx : 0), at.s.y - ("sy" in d ? d.sy : 0)) > MOVE_PX
    if (d.kind === "pan") {
      const base = d.view
      const sx = d.sx, sy = d.sy
      d.moved = true
      setView({ ...base, tx: base.tx + at.s.x - sx, ty: base.ty + at.s.y - sy })
      return
    }
    if (d.kind === "room") {
      setRoomRect({ a: d.start, b: snapPoint(floor, at.p, null, tolMm, snapEnabled).p })
      return
    }
    if (d.kind === "wall") {
      if (!d.moved && !far) return
      d.moved = true
      const edge = floor.wallGraph.edges[d.id]
      const a = floor.wallGraph.nodes[edge.a], b = floor.wallGraph.nodes[edge.b]
      const delta = perpendicularDelta(a, b, d.from, at.p, snapEnabled ? 50 : 1)
      setPreview(findFloor(new MoveWallCommand(floor.id, d.id, delta.dx, delta.dy).apply(doc), floor.id) ?? null)
      return
    }
    if (d.kind === "node") {
      if (!d.moved && !far) return
      d.moved = true
      // привязка к другим узлам и стенам, кроме своих рёбер
      const others = { wallGraph: { nodes: Object.fromEntries(Object.entries(floor.wallGraph.nodes).filter(([id]) => id !== d.id)), edges: Object.fromEntries(Object.entries(floor.wallGraph.edges).filter(([, ed]) => ed.a !== d.id && ed.b !== d.id)) } }
      const sn = snapPoint(others, at.p, null, tolMm, snapEnabled)
      setCursor({ screen: at.s, plan: at.p, snap: sn })
      setPreview(findFloor(new MoveNodeCommand(floor.id, d.id, sn.p).apply(doc), floor.id) ?? null)
      return
    }
    if (d.kind === "opening") {
      if (!d.moved && !far) return
      d.moved = true
      const o = floor.openings.find((x) => x.id === d.id)
      const ed = o && floor.wallGraph.edges[o.wallId]
      const a = ed && floor.wallGraph.nodes[ed.a], b = ed && floor.wallGraph.nodes[ed.b]
      if (!o || !a || !b) return
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      let off = closestOnSegment(at.p, a, b).t * L
      if (snapEnabled) off = Math.round(off / 50) * 50
      off = Math.max(o.width / 2 + 50, Math.min(L - o.width / 2 - 50, off))
      setPreview(findFloor(new MoveOpeningCommand(floor.id, d.id, Math.round(off)).apply(doc), floor.id) ?? null)
      return
    }
    if (d.kind === "object") {
      if (!d.moved && !far) return
      d.moved = true
      let x = d.origin.x + at.p.x - d.from.x, y = d.origin.y + at.p.y - d.from.y
      if (snapEnabled && !e.altKey) { x = Math.round(x / 50) * 50; y = Math.round(y / 50) * 50 }
      setPreview(findFloor(new MoveObjectCommand({ floorId: floor.id }, d.id, Math.round(x), Math.round(y)).apply(doc), floor.id) ?? null)
      return
    }
    if (d.kind === "stair") {
      if (!d.moved && !far) return
      d.moved = true
      let x = d.origin.x + at.p.x - d.from.x, y = d.origin.y + at.p.y - d.from.y
      if (floor.stairs.find((q) => q.id === d.id)?.shape === "column" && !e.altKey) {
        const sn = snapColumn(floor, { x, y }, tolMm, d.id, snapEnabled ? 50 : 0)
        setCursor({ screen: at.s, plan: at.p, snap: sn })
        x = sn.p.x; y = sn.p.y
      } else if (snapEnabled) { x = Math.round(x / 50) * 50; y = Math.round(y / 50) * 50 }
      setPreview(findFloor(new MoveStairCommand(floor.id, d.id, Math.round(x), Math.round(y)).apply(doc), floor.id) ?? null)
      return
    }
    if (d.kind === "click" && far) d.moved = true
  }

  function onPointerUp(e: React.PointerEvent) {
    const at = planAt(e)
    const d = drag.current
    drag.current = null
    if (!at || !v || !floor || !d) return
    if (d.kind === "box") {
      setBoxRect(null)
      if (!d.moved) {
        selectHit(pendingHit.current)
        if (!e.shiftKey) useEditorStore.getState().clearMulti()
        return
      }
      const pa = toPlan(v, { x: d.sx, y: d.sy }), pb = at.p
      const rect = { minX: Math.min(pa.x, pb.x), minY: Math.min(pa.y, pb.y), maxX: Math.max(pa.x, pb.x), maxY: Math.max(pa.y, pb.y) }
      // слева направо — целиком внутри, справа налево — задетые
      const ids = wallsInRect(floor, rect, at.s.x < d.sx)
      const st = useEditorStore.getState()
      st.setMulti(d.additive ? [...new Set([...st.multi, ...ids])] : ids)
      return
    }
    if (d.kind === "pan") {
      if (!d.moved && e.button === 2) {
        // правый клик без протяжки — закончить цепочку стен, размер, трассу
        setChain(null)
        setDimPts([])
        if (tool === "mep-run") finishRun()
        else setPts2([])
      }
      return
    }
    if (d.kind === "room") {
      setRoomRect(null)
      const b = snapPoint(floor, at.p, null, tolMm, snapEnabled).p
      if (Math.abs(b.x - d.start.x) > 300 && Math.abs(b.y - d.start.y) > 300) {
        execute(new AddRoomCommand(floor.id, d.start.x, d.start.y, b.x, b.y, replanMode ? { thickness: 150, height: 3500, kind: "interior", phase: "new" } : { thickness: 150, height: 3500, kind: "interior" }))
      }
      return
    }
    if (d.kind === "wall" || d.kind === "node" || d.kind === "opening" || d.kind === "stair" || d.kind === "object") {
      setPreview(null)
      if (!d.moved) return
      const edge = d.kind === "wall" ? floor.wallGraph.edges[d.id] : undefined
      if (d.kind === "wall" && edge) {
        const delta = perpendicularDelta(floor.wallGraph.nodes[edge.a], floor.wallGraph.nodes[edge.b], d.from, at.p, snapEnabled ? 50 : 1)
        if (delta.dx || delta.dy) execute(new MoveWallCommand(floor.id, d.id, delta.dx, delta.dy))
      } else if (d.kind === "node") {
        const others = { wallGraph: { nodes: Object.fromEntries(Object.entries(floor.wallGraph.nodes).filter(([id]) => id !== d.id)), edges: Object.fromEntries(Object.entries(floor.wallGraph.edges).filter(([, ed]) => ed.a !== d.id && ed.b !== d.id)) } }
        execute(new MoveNodeCommand(floor.id, d.id, snapPoint(others, at.p, null, tolMm, snapEnabled).p))
      } else if (d.kind === "opening") {
        const o = floor.openings.find((x) => x.id === d.id)
        const ed = o && floor.wallGraph.edges[o.wallId]
        const a = ed && floor.wallGraph.nodes[ed.a], b = ed && floor.wallGraph.nodes[ed.b]
        if (o && a && b) {
          const L = Math.hypot(b.x - a.x, b.y - a.y)
          let off = closestOnSegment(at.p, a, b).t * L
          if (snapEnabled) off = Math.round(off / 50) * 50
          execute(new MoveOpeningCommand(floor.id, d.id, Math.round(Math.max(o.width / 2 + 50, Math.min(L - o.width / 2 - 50, off)))))
        }
      } else if (d.kind === "object") {
        let x = d.origin.x + at.p.x - d.from.x, y = d.origin.y + at.p.y - d.from.y
        if (snapEnabled && !e.altKey) { x = Math.round(x / 50) * 50; y = Math.round(y / 50) * 50 }
        execute(new MoveObjectCommand({ floorId: floor.id }, d.id, Math.round(x), Math.round(y)))
      } else if (d.kind === "stair") {
        let x = d.origin.x + at.p.x - d.from.x, y = d.origin.y + at.p.y - d.from.y
        if (floor.stairs.find((q) => q.id === d.id)?.shape === "column" && !e.altKey) ({ x, y } = snapColumn(floor, { x, y }, tolMm, d.id, snapEnabled ? 50 : 0).p)
        else if (snapEnabled) { x = Math.round(x / 50) * 50; y = Math.round(y / 50) * 50 }
        execute(new MoveStairCommand(floor.id, d.id, Math.round(x), Math.round(y)))
      }
      return
    }
    // клик
    if (d.kind === "click" && d.moved) return
    const snap = snapPoint(floor, at.p, tool === "wall" ? chain : dimPts[0] ?? null, tolMm, snapEnabled && !e.altKey).p
    switch (tool) {
      case "select":
        selectHit(d.kind === "click" ? d.hit : null)
        break
      case "delete":
        deleteHit(d.kind === "click" ? d.hit : null)
        break
      case "wall":
        if (!chain) setChain(snap)
        else if (e.detail >= 2) setChain(null)
        else commitWall(snap)
        break
      case "door":
      case "window":
        placeOpening(at.p)
        break
      case "measure": {
        const pt = snapPoint(floor, at.p, pts2[0] ?? null, tolMm, snapEnabled && !e.altKey).p
        if (pts2.length === 0) { setPts2([pt]); setMeasured(null) }
        else { setMeasured({ a: pts2[0], b: pt }); setPts2([]) }
        break
      }
      case "section": {
        let pt = { x: Math.round(at.p.x), y: Math.round(at.p.y) }
        if (pts2.length === 0) { setPts2([snapEnabled ? { x: Math.round(pt.x / 100) * 100, y: Math.round(pt.y / 100) * 100 } : pt]); break }
        const a0 = pts2[0]
        if (snapEnabled) {
          const ang = Math.abs((Math.atan2(pt.y - a0.y, pt.x - a0.x) * 180) / Math.PI)
          if (ang < 10 || ang > 170) pt = { x: pt.x, y: a0.y }
          else if (Math.abs(ang - 90) < 10) pt = { x: a0.x, y: pt.y }
        }
        if (Math.hypot(pt.x - a0.x, pt.y - a0.y) < 500 || !building) break
        execute(new AddSectionCommand(building.id, { id: uid("sec"), name: nextSectionName(doc, building.id), a: a0, b: pt, look: 1 }))
        setPts2([])
        break
      }
      case "mep-run": {
        const targets: Vec2[] = [...(floor.mepDevices ?? []).filter((x) => x.system === mepSystem).map((x) => x.at), ...(floor.mepRuns ?? []).filter((r) => r.system === mepSystem).flatMap((r) => r.points)]
        const last = pts2[pts2.length - 1] ?? null
        if (last && pts2.length >= 2 && Math.hypot(at.p.x - last.x, at.p.y - last.y) <= tolMm) { finishRun(); break }
        const sp = snapMepPoint(at.p, last, { targets, tolMm, snap: snapEnabled && !e.altKey }).at
        setPts2([...pts2, sp])
        break
      }
      case "mep-device": {
        const info = MEP_DEVICE_BY_KIND[mepDeviceKind]
        if (!info) break
        const m = info.wall ? wallMount(at.p, floor.wallGraph, info.box.d) : null
        const where = m ?? { at: snapEnabled ? { x: Math.round(at.p.x / 50) * 50, y: Math.round(at.p.y / 50) * 50 } : { x: Math.round(at.p.x), y: Math.round(at.p.y) }, rotation: 0 }
        const same = (floor.mepDevices ?? []).filter((x) => x.kind === info.kind).length
        const label = info.riser ? `Ст ${MEP_SYSTEM_INFO[info.system].mark}-${same + 1}` : info.kind === "panel" ? `ЩР-${same + 1}` : ""
        execute(new AddMepDeviceCommand(floor.id, { id: uid("md"), system: info.system, kind: info.kind, at: where.at, height: deviceHeight(info, floor.height), rotation: where.rotation, label, power: info.power }))
        break
      }
      case "stair":
        placeStair(at.p)
        break
      case "object": {
        // мебель ставится и из плана: не нужно уходить в 3D
        if (!armedAsset) break
        const g = snapEnabled ? 50 : 1
        const at2 = { x: Math.round(at.p.x / g) * g, y: Math.round(at.p.y / g) * g }
        const taken = (floor.objects ?? []).some((ob) => pointInObject(ob, at2, 100))
        if (taken) break
        execute(new AddObjectCommand({ floorId: floor.id }, { id: uid("o"), assetId: armedAsset, position: { x: at2.x, y: 0, z: at2.y }, rotationY: 0, scale: 1, attachTo: "floor", locked: false }))
        break
      }
      case "annotate":
        if (annotateKind === "text") {
          const id = uid("an")
          execute(new AddAnnotationCommand(floor.id, { id, kind: "text", at: snap, text: "Надпись" }))
          setSelection({ type: "annotation", id, floorId: floor.id })
        } else if (dimPts.length < 2) {
          if (dimPts.length === 1 && Math.hypot(snap.x - dimPts[0].x, snap.y - dimPts[0].y) < 10) break
          setDimPts([...dimPts, snap])
        } else {
          const off = Math.round(signedOffset(dimPts[0], dimPts[1], at.p))
          execute(new AddAnnotationCommand(floor.id, { id: uid("an"), kind: "dim", a: dimPts[0], b: dimPts[1], offset: Math.abs(off) < 50 ? 600 : off }))
          setDimPts([])
        }
        break
    }
  }

  function finishRun() {
    if (!floor || pts2.length < 2) { setPts2([]); return }
    const info = MEP_SYSTEM_INFO[mepSystem]
    execute(new AddMepRunCommand(floor.id, { id: uid("mr"), system: mepSystem, points: pts2, height: Math.min(info.runHeight, floor.height - 100), size: info.size, label: "" }))
    setPts2([])
  }

  function onWheel(e: React.WheelEvent) {
    const at = planAt(e)
    if (!at || !v) return
    setView(zoomAt(v, at.s, Math.exp(-e.deltaY * 0.001)))
  }

  // клавиатура: Esc — прервать ввод, цифры + Enter — длина стены, F — вписать
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return
      if (ev.key === "Escape") {
        setChain(null); setDimPts([]); setLengthInput(""); setRoomRect(null); setPreview(null); setPts2([]); setMeasured(null); setBoxRect(null); drag.current = null
        return
      }
      if (ev.key === "Enter" && tool === "mep-run" && pts2.length >= 2) { ev.preventDefault(); finishRun(); return }
      if ((ev.key === "f" || ev.key === "F") && drawing) {
        setView(fitView(drawing.bounds, size.w, size.h, fitPad(size.w)))
        return
      }
      if (tool === "wall" && chain) {
        if (/^[0-9]$/.test(ev.key) || ev.key === "," || ev.key === ".") { ev.stopImmediatePropagation(); ev.preventDefault(); setLengthInput((s) => s + (ev.key === "." ? "," : ev.key)); return }
        if (ev.key === "Backspace") { ev.stopImmediatePropagation(); ev.preventDefault(); setLengthInput((s) => s.slice(0, -1)); return }
        if (ev.key === "Enter" && lengthInput && cursor) {
          ev.stopImmediatePropagation(); ev.preventDefault()
          const len = parseFloat(lengthInput.replace(",", ".")) * 1000
          const dx = cursor.plan.x - chain.x, dy = cursor.plan.y - chain.y
          const L = Math.hypot(dx, dy) || 1
          let ang = Math.atan2(dy, dx)
          if (snapEnabled) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12)
          if (len > 0) commitWall({ x: Math.round(chain.x + Math.cos(ang) * len), y: Math.round(chain.y + Math.sin(ang) * len) })
          void L
        }
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  if (!floor || !drawing || !v) {
    return <div ref={hostRef} className="absolute inset-0 z-[5]" style={{ background: "#eef1f5" }} />
  }

  const S = (p: Vec2) => toScreen(v, p)
  const pts = (list: Vec2[]) => list.map((p) => { const q = S(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}` }).join(" ")
  const px = (mm: number) => mm * v.k
  const gridStep = px(1000) >= 14 ? 1000 : px(5000) >= 14 ? 5000 : 10000
  const topLeft = toPlan(v, { x: 0, y: 0 }), bottomRight = toPlan(v, { x: size.w, y: size.h })
  const gridX: number[] = [], gridY: number[] = []
  for (let x = Math.floor(topLeft.x / gridStep) * gridStep; x <= bottomRight.x && gridX.length < 400; x += gridStep) gridX.push(x)
  for (let y = Math.floor(bottomRight.y / gridStep) * gridStep; y <= topLeft.y && gridY.length < 400; y += gridStep) gridY.push(y)
  const fontPx = Math.max(9, Math.min(14, px(320)))
  const u = floor.underlay
  const sel = selection
  const selWall = sel.type === "wall" && sel.id ? floor.wallGraph.edges[sel.id] : undefined
  const selOpening = sel.type === "opening" ? floor.openings.find((o) => o.id === sel.id) : undefined
  const selStair = sel.type === "stair" ? shown?.stairs.find((s) => s.id === sel.id) : undefined
  const snapMark = cursor?.snap && (cursor.snap.kind === "node" || cursor.snap.kind === "edge") ? S(cursor.snap.p) : null
  const hint =
    tool === "wall" ? (chain ? `Стена: клик — следующая точка, двойной клик или правая кнопка — конец${lengthInput ? ` · длина ${lengthInput} м, Enter` : " · цифры — длина в м"}` : "Стена: клик — начало, дальше цепочкой. Привязка к узлам и стенам, углы 15° (Alt — без привязки)")
    : tool === "room" ? "Комната: протяните прямоугольник"
    : tool === "door" || tool === "window" ? `${tool === "door" ? "Дверь" : "Окно"}: клик по стене`
    : tool === "stair" ? `${stairShape === "elevator" ? "Лифт" : stairShape === "porch" ? "Крыльцо: клик снаружи у стены" : stairShape === "ramp" ? "Пандус: клик снаружи у стены" : "Лестница"}: клик на плане`
    : tool === "annotate" ? (annotateKind === "text" ? "Надпись: клик" : dimPts.length === 0 ? "Размер: первая точка" : dimPts.length === 1 ? "Размер: вторая точка" : "Размер: клик — вынос размерной линии")
    : tool === "delete" ? "Удалить: клик по элементу (в перепланировке существующее помечается демонтажем)"
    : tool === "select" ? "Клик — выделить, тянуть выделенное — сдвинуть · рамка → внутри, ← задетые · Shift — добавить · ПКМ — панорама · F — вписать"
    : tool === "measure" ? (measured ? `Рулетка: ${Math.round(Math.hypot(measured.b.x - measured.a.x, measured.b.y - measured.a.y))} мм · клик — новый замер` : pts2.length ? "Рулетка: вторая точка" : "Рулетка: первая точка (привязка к узлам и стенам)")
    : tool === "section" ? (pts2.length ? "Разрез: вторая точка линии" : "Разрез: первая точка линии")
    : tool === "mep-run" ? `Трасса ${MEP_SYSTEM_INFO[mepSystem].name}: клики — точки${pts2.length ? `, ${(polylineLengthMm(pts2) / 1000).toFixed(2)} м` : ""}; клик в последней точке, правая кнопка или Enter — готово`
    : tool === "mep-device" ? `${MEP_DEVICE_BY_KIND[mepDeviceKind]?.name ?? "Прибор"}: клик; настенные встают на ближайшую стену`
    : tool === "object" ? (armedAsset ? "Объект: клик — поставить. Поворот и размер — в панели справа" : "Объект: выберите его в каталоге снизу")
    : "Этот инструмент работает в 3D — переключитесь кнопкой «3D»"

  // ── Раскладка подписей: помещения (приоритет), затем марки и надписи выходов без наложений ──
  type Box = { l: number; t: number; r: number; b: number }
  const taken: Box[] = []
  const overlaps = (bx: Box) => taken.some((o) => bx.l < o.r && bx.r > o.l && bx.t < o.b && bx.b > o.t)
  const textBox = (x: number, y: number, text: string, f: number): Box => {
    const w = text.length * f * 0.6 + 4, h = f * 1.25
    return { l: x - w / 2, t: y - h / 2, r: x + w / 2, b: y + h / 2 }
  }
  const roomLabels: Array<{ id: string; x: number; top: number; f: number; lines: Array<{ t: string; bold?: boolean; under?: boolean; color: string }> }> = []
  for (const r of rooms) {
    const at = drawing.rooms.find((x) => x.roomId === r.id)?.at
    let cx = 0, cy = 0
    for (const q of r.polygon) { cx += q.x; cy += q.y }
    const anchor = at ?? { x: cx / r.polygon.length, y: cy / r.polygon.length }
    const c = S(anchor)
    const lbl = drawing.rooms.find((x) => x.roomId === r.id)
    const common = !!lbl && lbl.use !== "rent"
    const link = common ? undefined : floor.premiseLinks[r.id]
    const premise = link ? resolvePremise(link) : undefined
    const name = common ? lbl.name : floor.roomNames?.[r.id]
    const area = `${(r.areaMm2 / 1e6).toFixed(1).replace(".", ",")} м²`
    const widthPx = px(spanAt(r.polygon, anchor, r.holes)) - 10
    const areaText = look === "draft" ? area.replace(" м²", "") : area
    const fits = (t: string, f: number) => t.length * f * 0.56 <= widthPx
    if (widthPx < 18) continue
    let f = fontPx
    while (f > 8 && !fits(areaText, f)) f -= 1
    if (!fits(areaText, f)) continue
    const cut = (t: string) => {
      if (fits(t, f)) return t
      const k = Math.floor(widthPx / (f * 0.56)) - 1
      return k >= 3 ? `${t.slice(0, k)}…` : ""
    }
    const lines: Array<{ t: string; bold?: boolean; under?: boolean; color: string }> = []
    const num = numbers.get(r.id)
    if (num && !common) lines.push({ t: cut(`№ ${num}`), bold: true, color: "#0f172a" })
    if (name) lines.push({ t: cut(name), color: common ? "#475569" : "#334155" })
    if (look === "rent" && premise?.tenantName) lines.push({ t: cut(shortTenantName(premise.tenantName)), color: "#334155" })
    lines.push({ t: areaText, under: true, color: look === "draft" ? "#111" : "#475569" })
    const shownLines = lines.filter((l) => l.t)
    const maxLines = Math.max(1, Math.floor(px(Math.sqrt(r.areaMm2)) / (f * 1.25)))
    const visible = shownLines.length > maxLines ? shownLines.slice(shownLines.length - maxLines) : shownLines
    const top = c.y - ((visible.length - 1) * f * 1.2) / 2
    const longest = visible.reduce((m, l) => Math.max(m, l.t.length), 0)
    taken.push({ l: c.x - (longest * f * 0.6) / 2, t: top - f * 0.7, r: c.x + (longest * f * 0.6) / 2, b: top + (visible.length - 1) * f * 1.2 + f * 0.7 })
    roomLabels.push({ id: r.id, x: c.x, top, f, lines: visible })
  }
  // надписи выходов
  const exitLabels = drawing.exits.map((ex) => {
    const a = S(ex.at)
    const dir = { x: ex.dir.x, y: -ex.dir.y }
    const L = Math.max(22, px(1200))
    const tip = { x: a.x + dir.x * L, y: a.y + dir.y * L }
    const text = ex.kind === "emergency" ? "ВЫХОД" : "ВХОД"
    // текст за стрелкой; если занято — сбоку от стрелки
    const cands = [{ x: tip.x + dir.x * 18, y: tip.y + dir.y * 18 }, { x: tip.x - dir.y * 30, y: tip.y + dir.x * 30 }, { x: tip.x + dir.y * 30, y: tip.y - dir.x * 30 }]
    let pos: { x: number; y: number } | null = null
    for (const cnd of cands) {
      const bx = textBox(cnd.x, cnd.y, text, fontPx)
      if (!overlaps(bx)) { taken.push(bx); pos = cnd; break }
    }
    return { a, tip, dir, text, pos, color: ex.kind === "emergency" ? "#16a34a" : "#2563eb" }
  })
  // марки проёмов: от грани стены на 9 px, без наложений
  const markLabels: Array<{ x: number; y: number; t: string }> = []
  if (px(1000) >= 10) {
    for (const m of drawing.marks) {
      const b = S(m.base)
      const ns = { x: m.n.x, y: -m.n.y }
      const d = px(m.half) + 10
      const x = b.x + ns.x * d, y = b.y + ns.y * d
      const bx = textBox(x, y, m.text, 9)
      if (overlaps(bx)) continue
      taken.push(bx)
      markLabels.push({ x, y, t: m.text })
    }
  }

  // ── Размеры выделенного элемента прямо на плане: клик — ввод числа ─────────
  type EditDim = { key: string; at: Vec2; label: string; value: number; apply: (v: number) => void; min: number; max: number }
  const editDims: EditDim[] = []
  if (!drag.current && floor) {
    const fid = floor.id
    const outward = (p: Vec2, c: Vec2, px0: number) => {
      const L = Math.hypot(p.x - c.x, p.y - c.y) || 1
      return { x: p.x + ((p.x - c.x) / L) * px0, y: p.y + ((p.y - c.y) / L) * px0 }
    }
    if (sel.type === "wall" && selWall && sel.id) {
      const a = floor.wallGraph.nodes[selWall.a], b = floor.wallGraph.nodes[selWall.b]
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      const n = { x: -u.y, y: u.x }
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const off = selWall.thickness / 2 + 26 / v.k
      const wid = sel.id
      editDims.push({ key: `wl${wid}`, at: S({ x: mid.x + n.x * off, y: mid.y + n.y * off }), label: "Длина", value: Math.round(L), min: 100, max: 200000,
        apply: (val) => execute(new MoveNodeCommand(fid, selWall.b, { x: Math.round(a.x + u.x * val), y: Math.round(a.y + u.y * val) })) })
      editDims.push({ key: `wt${wid}`, at: S({ x: mid.x - n.x * off, y: mid.y - n.y * off }), label: "Толщина", value: selWall.thickness, min: 50, max: 1500,
        apply: (val) => execute(new SetWallPropsCommand(fid, wid, { thickness: val })) })
    }
    if (sel.type === "opening" && selOpening && sel.id) {
      const e = floor.wallGraph.edges[selOpening.wallId]
      const a = e && floor.wallGraph.nodes[e.a], b = e && floor.wallGraph.nodes[e.b]
      if (e && a && b) {
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
        const n = { x: -u.y, y: u.x }
        const c = { x: a.x + u.x * selOpening.offset, y: a.y + u.y * selOpening.offset }
        const off = e.thickness / 2 + 30 / v.k
        const oid = sel.id
        editDims.push({ key: `ow${oid}`, at: S({ x: c.x + n.x * off, y: c.y + n.y * off }), label: "Ширина", value: selOpening.width, min: 300, max: Math.max(300, Math.round(L - 100)), apply: (val) => execute(new SetOpeningSizeCommand(fid, oid, { width: val })) })
        editDims.push({ key: `oh${oid}`, at: S({ x: c.x - n.x * off, y: c.y - n.y * off }), label: "Высота", value: selOpening.height, min: 300, max: 6000, apply: (val) => execute(new SetOpeningSizeCommand(fid, oid, { height: val })) })
        if (selOpening.type === "window") editDims.push({ key: `os${oid}`, at: S({ x: c.x - n.x * off * 2.2, y: c.y - n.y * off * 2.2 }), label: "От пола", value: selOpening.sillHeight, min: 0, max: 3000, apply: (val) => execute(new SetOpeningSizeCommand(fid, oid, { sillHeight: val })) })
      }
    }
    if (sel.type === "stair" && selStair && sel.id) {
      const st = selStair
      const sid = sel.id
      const hole = stairHoleWorld(st, floor.height)
      const c = { x: hole.reduce((acc, q) => acc + q.x, 0) / 4, y: hole.reduce((acc, q) => acc + q.y, 0) / 4 }
      const e01 = S({ x: (hole[0].x + hole[1].x) / 2, y: (hole[0].y + hole[1].y) / 2 })
      const e12 = S({ x: (hole[1].x + hole[2].x) / 2, y: (hole[1].y + hole[2].y) / 2 })
      const cs = S(c)
      const across = Math.round(Math.hypot(hole[1].x - hole[0].x, hole[1].y - hole[0].y))
      const along = Math.round(Math.hypot(hole[2].x - hole[1].x, hole[2].y - hole[1].y))
      if (st.shape === "column") {
        editDims.push({ key: `cw${sid}`, at: outward(e01, cs, 22), label: columnSizeAll ? "Ширина (все)" : "Ширина", value: st.width, min: 100, max: 3000, apply: (val) => execute(setColumnSizeCommand(floor, sid, { width: val }, columnSizeAll)) })
        editDims.push({ key: `cd${sid}`, at: outward(e12, cs, 22), label: columnSizeAll ? "Глубина (все)" : "Глубина", value: st.depth ?? st.width, min: 100, max: 3000, apply: (val) => execute(setColumnSizeCommand(floor, sid, { depth: val }, columnSizeAll)) })
      } else if (st.shape === "elevator") {
        editDims.push({ key: `ew${sid}`, at: outward(e01, cs, 22), label: "Шахта", value: st.width, min: 1200, max: 4000, apply: (val) => execute(new SetStairCommand(fid, sid, { width: val })) })
      } else {
        const rise = stairRise(st, floor.height)
        const count = Math.max(st.shape === "porch" ? 1 : 2, Math.round(rise / 170))
        const runs = st.shape === "straight" || st.shape === "spiral" ? count : st.shape === "porch" ? Math.max(1, count - 1) : Math.ceil(count / 2)
        const clampT = (t: number) => Math.max(220, Math.min(450, Math.round(t)))
        editDims.push({ key: `sw${sid}`, at: outward(e01, cs, 22), label: st.shape === "porch" ? "Ширина" : "Ширина марша", value: st.width, min: 700, max: 6000, apply: (val) => execute(new SetStairCommand(fid, sid, { width: val })) })
        editDims.push({ key: `sl${sid}`, at: outward(e12, cs, 22), label: "Длина", value: along, min: 500, max: 20000,
          apply: (val) => execute(new SetStairCommand(fid, sid, { tread: clampT(st.shape === "porch" ? (val - 1400) / runs : val / runs) })) })
        editDims.push({ key: `sh${sid}`, at: { x: cs.x, y: cs.y + 16 }, label: "Высота", value: Math.round(rise), min: 150, max: 6000, apply: (val) => execute(new SetStairCommand(fid, sid, { rise: val })) })
        void across
      }
    }
  }

  // размер у выделенного не накрывает подписи помещений: отодвигаем от элемента, пока не свободно
  if (editDims.length) {
    const centre = editDims.reduce((acc, d) => ({ x: acc.x + d.at.x / editDims.length, y: acc.y + d.at.y / editDims.length }), { x: 0, y: 0 })
    const placed: Box[] = []
    for (const d of editDims) {
      const text = `${d.label} ${d.value}`
      const w = text.length * 6.6 + 12, h = 20
      const boxAt = (p: Vec2): Box => ({ l: p.x - w / 2, t: p.y - h / 2, r: p.x + w / 2, b: p.y + h / 2 })
      const hit = (bx: Box) => [...taken, ...placed].some((o) => bx.l < o.r && bx.r > o.l && bx.t < o.b && bx.b > o.t)
      let at = d.at
      const L = Math.hypot(d.at.x - centre.x, d.at.y - centre.y)
      const dir = L > 1 ? { x: (d.at.x - centre.x) / L, y: (d.at.y - centre.y) / L } : { x: 0, y: -1 }
      for (let step = 1; step <= 6 && hit(boxAt(at)); step++) at = { x: d.at.x + dir.x * 16 * step, y: d.at.y + dir.y * 16 * step }
      d.at = at
      placed.push(boxAt(at))
    }
  }

  function commitEdit(d: EditDim) {
    if (!editing) return
    const val = Math.round(parseFloat(editing.draft.replace(",", ".").replace(/\s/g, "")))
    setEditing(null)
    if (!Number.isFinite(val)) return
    const clamped = Math.max(d.min, Math.min(d.max, val))
    if (clamped !== d.value) d.apply(clamped)
  }

  // ── Линейки по краям: как в CAD, с шагом под текущий масштаб ──
  // линейки стоят не по краю экрана, а по краю свободного поля: слева панель
  // этажей, сверху — тулбар
  const RULER = 18
  const RX = 292
  const RY = 152
  const rulerStep = (() => {
    for (const mm of [100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000]) if (px(mm) >= 55) return mm
    return 100000
  })()
  const ruler = (() => {
    if (!v) return { x: [] as Array<{ p: number; mm: number }>, y: [] as Array<{ p: number; mm: number }> }
    const left = toPlan(v, { x: 0, y: 0 }), right = toPlan(v, { x: size.w, y: size.h })
    const from = (a: number, b: number) => Math.ceil(Math.min(a, b) / rulerStep) * rulerStep
    const xs: Array<{ p: number; mm: number }> = []
    for (let mm = from(left.x, right.x); mm <= Math.max(left.x, right.x); mm += rulerStep) xs.push({ p: S({ x: mm, y: 0 }).x, mm })
    const ys: Array<{ p: number; mm: number }> = []
    for (let mm = from(left.y, right.y); mm <= Math.max(left.y, right.y); mm += rulerStep) ys.push({ p: S({ x: 0, y: mm }).y, mm })
    return { x: xs, y: ys }
  })()

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 z-[5] select-none"
      style={{ background: look === "draft" ? "#ffffff" : "#eef1f5", cursor: tool === "select" ? "default" : "crosshair" }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="plan-editor"
    >
      <svg width={size.w} height={size.h} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel} style={{ display: "block", touchAction: "none" }}>
        <defs>
          <pattern id="pe-hatch" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} stroke="#15803d" strokeWidth={1.2} />
          </pattern>
          <pattern id="pe-mop" patternUnits="userSpaceOnUse" width={10} height={10} patternTransform="rotate(45)">
            <rect width={10} height={10} fill="#f8fafc" />
            <line x1={0} y1={0} x2={0} y2={10} stroke="#cbd5e1" strokeWidth={1} />
          </pattern>
        </defs>
        {gridX.map((x) => { const s = S({ x, y: 0 }); return <line key={`gx${x}`} x1={s.x} y1={0} x2={s.x} y2={size.h} stroke={look === "draft" ? "#f1f5f9" : x === 0 ? "#cbd5e1" : "#e2e8f0"} strokeWidth={1} /> })}
        {gridY.map((y) => { const s = S({ x: 0, y }); return <line key={`gy${y}`} x1={0} y1={s.y} x2={size.w} y2={s.y} stroke={look === "draft" ? "#f1f5f9" : y === 0 ? "#cbd5e1" : "#e2e8f0"} strokeWidth={1} /> })}

        {u && (() => {
          const h = u.widthMm / (u.aspect || 1)
          const tl = S({ x: u.x, y: u.y + h })
          const cx = tl.x + px(u.widthMm) / 2, cy = tl.y + px(h) / 2
          return <image href={u.url} x={tl.x} y={tl.y} width={px(u.widthMm)} height={px(h)} opacity={u.opacity} preserveAspectRatio="none" transform={`rotate(${u.rotationDeg} ${cx} ${cy})`} style={{ pointerEvents: "none" }} />
        })()}

        {/* помещения: заливка по статусу аренды */}
        {rooms.map((r) => {
          const common = drawing.rooms.find((x) => x.roomId === r.id)?.use !== "rent"
          const link = common ? undefined : floor.premiseLinks[r.id]
          const premise = link ? resolvePremise(link) : undefined
          // МОП и технические — штриховка: часть здания, не аренда
          const fill = common ? "url(#pe-mop)" : look === "rent" && premise ? `${STATUS_COLOR[premise.status]}33` : "#ffffff"
          const selected = sel.type === "room" && sel.id === r.id
          const ring = (list: Vec2[]) => list.map((q, i) => { const t = S(q); return `${i ? "L" : "M"}${t.x.toFixed(1)} ${t.y.toFixed(1)}` }).join(" ") + " Z"
          return <path key={r.id} d={[r.polygon, ...(r.holes ?? [])].map(ring).join(" ")} fillRule="evenodd" fill={fill} stroke={selected ? TOKENS.accent : "none"} strokeWidth={selected ? 3 : 0} />
        })}

        {/* стены */}
        {drawing.wallSolids.map((q, i) => {
          const st = drawing.wallStyles[i]
          if (st === "demolish") return <polygon key={`w${i}`} points={pts(q)} fill="#fee2e2" stroke="#dc2626" strokeWidth={1.2} strokeDasharray="5 3" />
          if (st === "new") return <polygon key={`w${i}`} points={pts(q)} fill="url(#pe-hatch)" stroke="#15803d" strokeWidth={1.2} />
          return <polygon key={`w${i}`} points={pts(q)} fill={look === "draft" ? "#111111" : "#1e293b"} />
        })}
        {drawing.thinLines.map(([a, b], i) => { const p = S(a), q = S(b); return <line key={`t${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#334155" strokeWidth={1} /> })}
        {drawing.arcs.map((a, i) => {
          const r = px(a.r)
          const s0 = S({ x: a.c.x + a.r * Math.cos((a.start * Math.PI) / 180), y: a.c.y + a.r * Math.sin((a.start * Math.PI) / 180) })
          const s1 = S({ x: a.c.x + a.r * Math.cos((a.end * Math.PI) / 180), y: a.c.y + a.r * Math.sin((a.end * Math.PI) / 180) })
          return <path key={`a${i}`} d={`M ${s0.x} ${s0.y} A ${r} ${r} 0 0 0 ${s1.x} ${s1.y}`} fill="none" stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" />
        })}

        {/* размерные цепочки, оси, марки — как на листе АР */}
        {look === "draft" && (() => {
          const b = drawing.bounds
          const BASE = 26, STEP = 22, REACH = BASE + STEP * 3 + 16, R = 11
          const items: React.ReactNode[] = []
          drawing.dims.forEach((dim, i) => {
            const n = dim.side === "top" ? { x: 0, y: -1 } : dim.side === "bottom" ? { x: 0, y: 1 } : dim.side === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 }
            const off = BASE + STEP * (dim.level - 1)
            const pa = S(dim.a), pb = S(dim.b)
            const vertical = dim.side === "left" || dim.side === "right"
            const edge = vertical ? S({ x: dim.edge, y: 0 }).x : S({ x: 0, y: dim.edge }).y
            const a2 = vertical ? { x: edge + n.x * off, y: pa.y } : { x: pa.x, y: edge + n.y * off }
            const b2 = vertical ? { x: edge + n.x * off, y: pb.y } : { x: pb.x, y: edge + n.y * off }
            const len = Math.hypot(b2.x - a2.x, b2.y - a2.y)
            const mx = (a2.x + b2.x) / 2, my = (a2.y + b2.y) / 2
            items.push(
              <g key={`dm${i}`} stroke="#111" strokeWidth={0.8}>
                <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} />
                <line x1={pa.x + n.x * 6} y1={pa.y + n.y * 6} x2={a2.x + n.x * 5} y2={a2.y + n.y * 5} strokeWidth={0.6} />
                <line x1={pb.x + n.x * 6} y1={pb.y + n.y * 6} x2={b2.x + n.x * 5} y2={b2.y + n.y * 5} strokeWidth={0.6} />
                {[a2, b2].map((p, j) => <line key={j} x1={p.x - 3.5} y1={p.y + 3.5} x2={p.x + 3.5} y2={p.y - 3.5} strokeWidth={1.4} />)}
                {len >= 26 && (
                  <text x={vertical ? mx - 4 : mx} y={vertical ? my : my - 4} fontSize={10} textAnchor="middle" stroke="none" fill="#111" transform={vertical ? `rotate(-90 ${mx - 4} ${my})` : undefined}>{dim.text}</text>
                )}
              </g>,
            )
          })
          drawing.axes.forEach((ax, i) => {
            if (ax.dir === "v") {
              const x = S({ x: ax.at, y: 0 }).x
              const y0 = S({ x: 0, y: b.maxY }).y - REACH, y1 = S({ x: 0, y: b.minY }).y + REACH
              items.push(
                <g key={`ax${i}`}>
                  <line x1={x} y1={y0} x2={x} y2={y1} stroke="#64748b" strokeWidth={0.7} strokeDasharray="18 4 3 4" />
                  {[y0 - R, y1 + R].map((cy) => <g key={cy}><circle cx={x} cy={cy} r={R} fill="#fff" stroke="#111" strokeWidth={1} /><text x={x} y={cy + 4} fontSize={12} textAnchor="middle" fill="#111">{ax.label}</text></g>)}
                </g>,
              )
            } else {
              const y = S({ x: 0, y: ax.at }).y
              const x0 = S({ x: b.minX, y: 0 }).x - REACH, x1 = S({ x: b.maxX, y: 0 }).x + REACH
              items.push(
                <g key={`ax${i}`}>
                  <line x1={x0} y1={y} x2={x1} y2={y} stroke="#64748b" strokeWidth={0.7} strokeDasharray="18 4 3 4" />
                  {[x0 - R, x1 + R].map((cx) => <g key={cx}><circle cx={cx} cy={y} r={R} fill="#fff" stroke="#111" strokeWidth={1} /><text x={cx} y={y + 4} fontSize={12} textAnchor="middle" fill="#111">{ax.label}</text></g>)}
                </g>,
              )
            }
          })
          markLabels.forEach((m, i) => {
            items.push(<text key={`mk${i}`} x={m.x} y={m.y} fontSize={9} textAnchor="middle" dominantBaseline="middle" fill="#111" style={{ pointerEvents: "none" }}>{m.t}</text>)
          })
          return <g style={{ pointerEvents: "none" }}>{items}</g>
        })()}

        {/* мебель и оборудование: габарит по осям объекта, направление — «носом» вперёд */}
        {(shown?.objects ?? []).map((ob) => {
          const f = objectFootprint(ob)
          const pts2 = objectCorners(ob).map(S)
          const sel2 = sel.type === "object" && sel.id === ob.id
          const c = S(f.c)
          const nose = S({ x: f.c.x - Math.sin(f.rot) * (f.d / 2), y: f.c.y - Math.cos(f.rot) * (f.d / 2) })
          return (
            <g key={`ob${ob.id}`}>
              <polygon points={pts2.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")} fill={sel2 ? "rgba(56,189,248,0.22)" : "rgba(148,163,184,0.16)"} stroke={sel2 ? TOKENS.accent : "#64748b"} strokeWidth={sel2 ? 2.5 : 1.2} />
              <line x1={c.x} y1={c.y} x2={nose.x} y2={nose.y} stroke={sel2 ? TOKENS.accent : "#94a3b8"} strokeWidth={1.2} />
            </g>
          )
        })}

        {/* лестницы, лифты, выходы */}
        {drawing.stairWells.map((q, i) => (
          <polygon key={`sw${i}`} points={pts(q)} fill="none" stroke="#64748b" strokeWidth={1.4} strokeDasharray="10 3 2 3" />
        ))}
        {drawing.stairArrows.map((list, i) => {
          const sp = list.map(S)
          const e = sp[sp.length - 1], b = sp[sp.length - 2]
          const L = Math.hypot(e.x - b.x, e.y - b.y) || 1
          const ux = (e.x - b.x) / L, uy = (e.y - b.y) / L
          return (
            <g key={`sa${i}`} stroke="#0f172a" fill="none" strokeWidth={1.2}>
              <polyline points={sp.map((p) => `${p.x},${p.y}`).join(" ")} />
              <polygon points={`${e.x},${e.y} ${e.x - ux * 10 - uy * 4},${e.y - uy * 10 + ux * 4} ${e.x - ux * 10 + uy * 4},${e.y - uy * 10 - ux * 4}`} fill="#0f172a" />
              <circle cx={sp[0].x} cy={sp[0].y} r={3} fill="#0f172a" />
            </g>
          )
        })}
        {drawing.lifts.map((lf, i) => (
          <g key={`lf${i}`}>
            <polygon points={pts(lf.shaft)} fill="#e2e8f0" stroke="#0f172a" strokeWidth={2} />
            <polygon points={pts(lf.cabin)} fill="#f8fafc" stroke="#475569" strokeWidth={1} />
            {(() => { const c = lf.cabin.map(S); return <><line x1={c[0].x} y1={c[0].y} x2={c[2].x} y2={c[2].y} stroke="#475569" /><line x1={c[1].x} y1={c[1].y} x2={c[3].x} y2={c[3].y} stroke="#475569" /></> })()}
            {(() => { const c = S({ x: (lf.shaft[0].x + lf.shaft[2].x) / 2, y: (lf.shaft[0].y + lf.shaft[2].y) / 2 }); return <text x={c.x} y={c.y} fontSize={fontPx} textAnchor="middle" dominantBaseline="middle" fontWeight={700} fill="#0f172a" style={{ paintOrder: "stroke", stroke: "#f8fafc", strokeWidth: 3 }}>ЛИФТ</text> })()}
          </g>
        ))}
        {exitLabels.map((ex, i) => (
          <g key={`ex${i}`} stroke={ex.color} fill={ex.color} style={{ pointerEvents: "none" }}>
            <line x1={ex.a.x} y1={ex.a.y} x2={ex.tip.x} y2={ex.tip.y} strokeWidth={3} />
            <polygon points={`${ex.tip.x},${ex.tip.y} ${ex.tip.x - ex.dir.x * 11 - ex.dir.y * 6},${ex.tip.y - ex.dir.y * 11 + ex.dir.x * 6} ${ex.tip.x - ex.dir.x * 11 + ex.dir.y * 6},${ex.tip.y - ex.dir.y * 11 - ex.dir.x * 6}`} stroke="none" />
            {ex.pos && <text x={ex.pos.x} y={ex.pos.y} fontSize={fontPx} textAnchor="middle" dominantBaseline="middle" stroke="none" fontWeight={700} style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 }}>{ex.text}</text>}
          </g>
        ))}

        {/* сети: трассы и приборы тонко, чтобы видеть при перепланировке */}
        {(shown?.mepRuns ?? []).map((r) => <polyline key={r.id} points={pts(r.points)} fill="none" stroke={MEP_SYSTEM_INFO[r.system].color} strokeWidth={1.5} opacity={0.7} />)}
        {(shown?.mepDevices ?? []).map((dv) => { const c = S(dv.at); const on = sel.type === "mep-device" && sel.id === dv.id; return <circle key={dv.id} cx={c.x} cy={c.y} r={on ? 6 : 4} fill={MEP_SYSTEM_INFO[dv.system].color} stroke={on ? TOKENS.accent : "#fff"} strokeWidth={on ? 3 : 1} /> })}

        {/* размеры и надписи инженера */}
        {(shown?.annotations ?? []).map((an) => {
          const on = sel.type === "annotation" && sel.id === an.id
          if (an.kind === "text") { const c = S(an.at); return <text key={an.id} x={c.x} y={c.y} fontSize={fontPx + 1} textAnchor="middle" dominantBaseline="middle" fill={on ? "#0284c7" : "#0f172a"} fontWeight={on ? 700 : 500}>{an.text}</text> }
          const g = dimGeometry(an.a, an.b, an.offset)
          const p1 = S(g.p1), p2 = S(g.p2), m = S(g.mid)
          return (
            <g key={an.id} stroke={on ? "#0284c7" : "#0369a1"} strokeWidth={on ? 2 : 1}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
              {g.ext.map(([p, q], j) => { const a = S(p), b = S(q); return <line key={j} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> })}
              <text x={m.x} y={m.y - 6} fontSize={fontPx} textAnchor="middle" stroke="none" fill="#0369a1" fontWeight={700} transform={`rotate(${-g.angleDeg} ${m.x} ${m.y})`}>{Math.round(g.lengthMm)}</text>
            </g>
          )
        })}

        {/* подписи помещений */}
        {roomLabels.map((lb) => (
          <g key={`lbl${lb.id}`} style={{ pointerEvents: "none" }} fontSize={lb.f} textAnchor="middle">
            {lb.lines.map((l, k) => (
              <text key={k} x={lb.x} y={lb.top + k * lb.f * 1.2} dominantBaseline="middle" fontWeight={l.bold ? 700 : 400} fill={l.color} textDecoration={l.under ? "underline" : undefined}>{l.t}</text>
            ))}
          </g>
        ))}

        {/* выделение */}
        {selWall && (() => {
          const a = floor.wallGraph.nodes[selWall.a], b = floor.wallGraph.nodes[selWall.b]
          const pa = S(a), pb = S(b)
          const L = Math.round(Math.hypot(b.x - a.x, b.y - a.y))
          const m = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
          return (
            <g>
              <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={TOKENS.accent} strokeWidth={Math.max(4, px(selWall.thickness))} strokeOpacity={0.45} strokeLinecap="round" />
              {[pa, pb].map((p, i) => <rect key={i} x={p.x - 6} y={p.y - 6} width={12} height={12} fill="#fff" stroke={TOKENS.accent} strokeWidth={2} />)}
              <text x={m.x} y={m.y - 10} fontSize={12} fontWeight={700} textAnchor="middle" fill="#0369a1" style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 4 }}>{L}</text>
            </g>
          )
        })()}
        {selOpening && (() => {
          const e = floor.wallGraph.edges[selOpening.wallId]
          const a = e && floor.wallGraph.nodes[e.a], b = e && floor.wallGraph.nodes[e.b]
          if (!a || !b) return null
          const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
          const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L
          const p0 = S({ x: a.x + ux * (selOpening.offset - selOpening.width / 2), y: a.y + uy * (selOpening.offset - selOpening.width / 2) })
          const p1 = S({ x: a.x + ux * (selOpening.offset + selOpening.width / 2), y: a.y + uy * (selOpening.offset + selOpening.width / 2) })
          return <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={TOKENS.accent} strokeWidth={Math.max(6, px(e.thickness) + 4)} strokeOpacity={0.6} />
        })()}
        {selStair && <polygon points={pts(stairHoleWorld(selStair, floor.height))} fill="none" stroke={TOKENS.accent} strokeWidth={3} />}

        {/* набор стен (рамка, Shift+клик) */}
        {multi.map((id) => {
          const e = floor.wallGraph.edges[id]
          const a = e && floor.wallGraph.nodes[e.a], b = e && floor.wallGraph.nodes[e.b]
          if (!e || !a || !b) return null
          const pa = S(a), pb = S(b)
          return <line key={`m${id}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#f59e0b" strokeWidth={Math.max(4, px(e.thickness))} strokeOpacity={0.5} strokeLinecap="round" />
        })}
        {/* под курсором */}
        {hover && !drag.current && (() => {
          if (hover.kind === "wall" && hover.id !== sel.id) {
            const e = floor.wallGraph.edges[hover.id]
            const a = e && floor.wallGraph.nodes[e.a], b = e && floor.wallGraph.nodes[e.b]
            if (!e || !a || !b) return null
            const pa = S(a), pb = S(b)
            return <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={tool === "delete" ? "#ef4444" : "#38bdf8"} strokeWidth={Math.max(3, px(e.thickness))} strokeOpacity={0.35} strokeLinecap="round" />
          }
          if (hover.kind === "room" && tool !== "door" && tool !== "window") {
            const r = rooms.find((x) => x.id === hover.id)
            return r ? <polygon points={pts(r.polygon)} fill="rgba(56,189,248,0.07)" stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 3" style={{ pointerEvents: "none" }} /> : null
          }
          return null
        })()}
        {/* линии разрезов здания */}
        {(building?.sections ?? []).map((sec) => {
          const a = S(sec.a), b = S(sec.b)
          const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
          const tx = (b.x - a.x) / L, ty = (b.y - a.y) / L
          // взгляд в экранных координатах: нормаль к линии со стороны look (ось Y экрана вниз)
          const dx = ty * sec.look, dy = -tx * sec.look
          return (
            <g key={sec.id} stroke="#dc2626" fill="#dc2626">
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1.2} strokeDasharray="14 4 2 4" />
              {[a, b].map((p, i) => (
                <g key={i}>
                  <line x1={p.x} y1={p.y} x2={p.x + dx * 18} y2={p.y + dy * 18} strokeWidth={2} />
                  <polygon points={`${p.x + dx * 24},${p.y + dy * 24} ${p.x + dx * 14 + tx * 5},${p.y + dy * 14 + ty * 5} ${p.x + dx * 14 - tx * 5},${p.y + dy * 14 - ty * 5}`} stroke="none" />
                  <text x={p.x + dx * 34} y={p.y + dy * 34} fontSize={13} fontWeight={700} textAnchor="middle" dominantBaseline="middle" stroke="none">{sec.name.split("-")[0]}</text>
                </g>
              ))}
            </g>
          )
        })}
        {/* рулетка */}
        {(measured || (tool === "measure" && pts2.length === 1 && cursor)) && (() => {
          const a0 = measured ? measured.a : pts2[0]
          const b0 = measured ? measured.b : cursor?.snap?.p ?? cursor!.plan
          const a = S(a0), b = S(b0)
          return (
            <g>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7c3aed" strokeWidth={2} />
              {[a, b].map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#7c3aed" />)}
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 12} fontSize={13} fontWeight={700} textAnchor="middle" fill="#6d28d9" style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 4 }}>{Math.round(Math.hypot(b0.x - a0.x, b0.y - a0.y))} мм</text>
            </g>
          )
        })()}
        {/* разрез и трасса сети — ввод */}
        {(tool === "section" || tool === "mep-run") && pts2.length > 0 && cursor && (
          <polyline points={pts([...pts2, cursor.plan])} fill="none" stroke={tool === "section" ? "#dc2626" : MEP_SYSTEM_INFO[mepSystem].color} strokeWidth={2} strokeDasharray={tool === "section" ? "14 4 2 4" : undefined} />
        )}
        {boxRect && (
          <rect x={Math.min(boxRect.a.x, boxRect.b.x)} y={Math.min(boxRect.a.y, boxRect.b.y)} width={Math.abs(boxRect.b.x - boxRect.a.x)} height={Math.abs(boxRect.b.y - boxRect.a.y)}
            fill={boxRect.b.x < boxRect.a.x ? "rgba(34,197,94,0.08)" : "rgba(56,189,248,0.08)"} stroke={boxRect.b.x < boxRect.a.x ? "#22c55e" : "#38bdf8"} strokeWidth={1.5} strokeDasharray={boxRect.b.x < boxRect.a.x ? "6 4" : undefined} />
        )}

        {/* ввод */}
        {tool === "wall" && chain && cursor?.snap && (() => {
          const a = S(chain), b = S(cursor.snap.p)
          const L = Math.round(Math.hypot(cursor.snap.p.x - chain.x, cursor.snap.p.y - chain.y))
          return (
            <g>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0284c7" strokeWidth={Math.max(3, px(200))} strokeOpacity={0.5} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 12} fontSize={12} fontWeight={700} textAnchor="middle" fill="#0369a1" style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 4 }}>{lengthInput ? `${lengthInput} м` : L}</text>
            </g>
          )
        })()}
        {tool === "annotate" && dimPts.length > 0 && cursor && (() => {
          const b = dimPts[1] ?? cursor.snap?.p ?? cursor.plan
          const off = dimPts[1] ? signedOffset(dimPts[0], dimPts[1], cursor.plan) : 600
          const g = dimGeometry(dimPts[0], b, off)
          const p1 = S(g.p1), p2 = S(g.p2)
          return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#0284c7" strokeWidth={1.5} strokeDasharray="6 4" />
        })()}
        {roomRect && (() => { const a = S(roomRect.a), b = S(roomRect.b); return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="rgba(2,132,199,0.08)" stroke="#0284c7" strokeWidth={2} strokeDasharray="6 4" /> })()}
        {cursor?.snap?.guides?.map((gd, i) => {
          const a = S(gd.from), b = S(gd.to)
          return <line key={`gd${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#16a34a" strokeWidth={1} strokeDasharray="4 4" style={{ pointerEvents: "none" }} />
        })}
        {snapMark && (cursor?.snap?.kind === "node"
          ? <rect x={snapMark.x - 6} y={snapMark.y - 6} width={12} height={12} fill="none" stroke="#16a34a" strokeWidth={2} />
          : <polygon points={`${snapMark.x},${snapMark.y - 7} ${snapMark.x + 7},${snapMark.y} ${snapMark.x},${snapMark.y + 7} ${snapMark.x - 7},${snapMark.y}`} fill="none" stroke="#ea580c" strokeWidth={2} />)}
      </svg>

      {editDims.map((d) => {
        const on = editing?.key === d.key
        return (
          <div key={d.key} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: d.at.x, top: d.at.y }} onPointerDown={(e) => e.stopPropagation()}>
            {on ? (
              <input
                autoFocus
                data-testid={`edit-${d.key}`}
                value={editing?.draft ?? ""}
                onChange={(e) => setEditing({ key: d.key, draft: e.target.value })}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitEdit(d); if (e.key === "Escape") setEditing(null) }}
                onBlur={() => commitEdit(d)}
                className="w-20 rounded-md px-1.5 py-0.5 text-center text-[12px] font-bold tabular-nums shadow-lg outline-none"
                style={{ background: "#fff", color: "#0369a1", border: "2px solid #0284c7" }}
              />
            ) : (
              <button
                type="button"
                data-testid={`dim-${d.key}`}
                title={`${d.label}, мм — клик, чтобы изменить`}
                onClick={() => setEditing({ key: d.key, draft: String(d.value) })}
                className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums shadow"
                style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #7dd3fc" }}
              >
                {d.label === "Длина" || d.label === "Ширина" || d.label === "Ширина марша" || d.label === "Шахта" ? "" : `${d.label} `}{d.value}
              </button>
            )}
          </div>
        )
      })}
      {/* линейки: сверху и слева, с меткой текущего положения курсора */}
      <svg width={Math.max(0, size.w - RX)} height={RULER} className="pointer-events-none absolute z-[6]" style={{ display: "block", left: RX, top: RY }}>
        <rect x={0} y={0} width={size.w} height={RULER} fill="rgba(248,250,252,0.92)" />
        <line x1={0} y1={RULER - 0.5} x2={size.w} y2={RULER - 0.5} stroke="#cbd5e1" strokeWidth={1} />
        {ruler.x.filter((t) => t.p > RX).map((t) => (
          <g key={`rx${t.mm}`}>
            <line x1={t.p - RX} y1={RULER - 6} x2={t.p - RX} y2={RULER} stroke="#94a3b8" strokeWidth={1} />
            <text x={t.p - RX + 2} y={RULER - 7} fontSize={9} fill="#475569">{(t.mm / 1000).toFixed(rulerStep < 1000 ? 1 : 0)}</text>
          </g>
        ))}
        {cursor && cursor.screen.x > RX && <line x1={cursor.screen.x - RX} y1={0} x2={cursor.screen.x - RX} y2={RULER} stroke="#0284c7" strokeWidth={1.5} />}
      </svg>
      <svg width={RULER} height={Math.max(0, size.h - RY)} className="pointer-events-none absolute z-[6]" style={{ display: "block", left: RX - RULER, top: RY }}>
        <rect x={0} y={0} width={RULER} height={size.h} fill="rgba(248,250,252,0.92)" />
        <line x1={RULER - 0.5} y1={0} x2={RULER - 0.5} y2={size.h} stroke="#cbd5e1" strokeWidth={1} />
        {ruler.y.filter((t) => t.p > RY).map((t) => (
          <g key={`ry${t.mm}`}>
            <line x1={RULER - 6} y1={t.p - RY} x2={RULER} y2={t.p - RY} stroke="#94a3b8" strokeWidth={1} />
            <text x={2} y={t.p - RY - 3} fontSize={9} fill="#475569" transform={`rotate(-90 12 ${t.p - RY - 3})`}>{(t.mm / 1000).toFixed(rulerStep < 1000 ? 1 : 0)}</text>
          </g>
        ))}
        {cursor && cursor.screen.y > RY && <line x1={0} y1={cursor.screen.y - RY} x2={RULER} y2={cursor.screen.y - RY} stroke="#0284c7" strokeWidth={1.5} />}
      </svg>

      <div className="absolute right-3 bottom-[11.5rem] z-10 flex overflow-hidden rounded-lg shadow" style={{ border: `1px solid ${TOKENS.panelBorder}` }} data-testid="plan-look">
        {([["draft", "Чертёж"], ["rent", "Аренда"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setLook(k)} className="px-2.5 py-1 text-[11px] font-semibold" style={{ background: look === k ? TOKENS.accent : TOKENS.panel, color: look === k ? "#0b1220" : TOKENS.text }}>{l}</button>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-[5.5rem] left-1/2 -translate-x-1/2 rounded-lg px-3 py-1.5 text-xs font-medium shadow" style={{ background: outsideHint ? "rgba(239,68,68,0.92)" : "rgba(15,23,42,0.85)", color: "#e2e8f0" }}>
        {outsideHint ?? hint}
      </div>
      <button
        type="button"
        onClick={() => setHelpOpen((x) => !x)}
        title="Горячие клавиши"
        className="absolute right-3 bottom-[14.5rem] z-10 h-7 w-7 rounded-lg text-[13px] font-bold shadow"
        style={{ background: helpOpen ? TOKENS.accent : TOKENS.panel, color: helpOpen ? "#0b1220" : TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }}
      >
        ?
      </button>
      {helpOpen && (
        <div className="absolute right-3 bottom-[18rem] z-10 w-72 rounded-xl p-3 text-[11px] shadow-xl" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.text }}>
          <div className="mb-1.5 text-xs font-semibold">Горячие клавиши</div>
          {[
            ["V", "выбор"], ["W", "стена"], ["R", "комната"], ["D", "дверь"], ["N", "окно"],
            ["S", "лестница"], ["I", "измерить"], ["Del", "удалить выбранное"],
            ["Ctrl+Z / Ctrl+Y", "отменить / вернуть"], ["Shift", "орто 90° при рисовании"],
            ["Alt", "без привязок"], ["цифры + Enter", "длина стены в метрах"],
            ["двойной клик", "конец цепочки стен"], ["колесо", "зум к курсору"],
            ["ПКМ или пробел+мышь", "сдвиг плана"], ["Esc", "отменить действие"],
          ].map(([k, t]) => (
            <div key={k} className="flex justify-between gap-2 py-0.5">
              <span className="font-mono" style={{ color: TOKENS.accent }}>{k}</span>
              <span style={{ color: TOKENS.muted }}>{t}</span>
            </div>
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-9 left-[13.5rem] rounded-md px-2 py-0.5 text-[11px] tabular-nums" style={{ background: "rgba(255,255,255,0.85)", color: "#334155" }}>
        {cursor ? `X ${(cursor.plan.x / 1000).toFixed(2)}  Y ${(cursor.plan.y / 1000).toFixed(2)} м · ` : ""}1 м = {px(1000).toFixed(0)} px
      </div>
    </div>
  )
}
