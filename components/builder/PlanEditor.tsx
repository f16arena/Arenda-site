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
import { roomExplication } from "@/lib/builder/drawing/schedules"
import { dimGeometry, signedOffset } from "@/lib/builder/annotations"
import { findPreset } from "@/lib/builder/openings"
import { MEP_SYSTEM_INFO } from "@/lib/builder/mep/catalog"
import { STATUS_COLOR, TOKENS } from "@/lib/builder/materials"
import { shortTenantName } from "@/lib/indoor-map/display-name"
import { stairHoleWorld } from "@/lib/builder/stair-hole"
import { fitView, hitTest, perpendicularDelta, snapPoint, toPlan, toScreen, wallsInRect, zoomAt, type Hit, type Snap, type View } from "@/lib/builder/plan-editor-math"

type Drag =
  | { kind: "pan"; sx: number; sy: number; view: View; moved: boolean }
  | { kind: "wall"; id: string; from: Vec2; moved: boolean; sx: number; sy: number }
  | { kind: "node"; id: string; moved: boolean; sx: number; sy: number }
  | { kind: "opening"; id: string; moved: boolean; sx: number; sy: number }
  | { kind: "stair"; id: string; from: Vec2; origin: Vec2; moved: boolean; sx: number; sy: number }
  | { kind: "room"; start: Vec2 }
  | { kind: "click"; hit: Hit | null; sx: number; sy: number; view: View; moved: boolean }
  | { kind: "box"; sx: number; sy: number; additive: boolean; moved: boolean }

const MOVE_PX = 4

/** Поля «вписать» с учётом панелей конструктора: этажи слева, свойства справа, тулбар сверху. */
function fitPad(w: number) {
  return w < 900 ? 40 : { left: 290, right: 290, top: 150, bottom: 110 }
}

export function PlanEditor() {
  const doc = useDocumentStore((s) => s.doc)
  const execute = useDocumentStore((s) => s.execute)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const tool = useEditorStore((s) => s.activeTool)
  const selection = useEditorStore((s) => s.selection)
  const setSelection = useEditorStore((s) => s.setSelection)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const replanMode = useEditorStore((s) => s.replanMode)
  const openingType = useEditorStore((s) => s.openingType)
  const openingVariant = useEditorStore((s) => s.openingVariant)
  const stairShape = useEditorStore((s) => s.stairShape)
  const annotateKind = useEditorStore((s) => s.annotateKind)
  const multi = useEditorStore((s) => s.multi)
  const mepSystem = useEditorStore((s) => s.mepSystem)
  const mepDeviceKind = useEditorStore((s) => s.mepDeviceKind)
  const resolvePremise = usePremiseStore((s) => s.resolve)

  const floor = activeLevelId && activeLevelId !== "site" ? findFloor(doc, activeLevelId) : doc.buildings[0]?.floors[0]
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

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const shown = preview ?? floor ?? null
  const rooms = useMemo(() => (shown ? detectRooms(shown.wallGraph) : []), [shown])
  const numbers = useMemo(() => {
    if (!shown) return new Map<string, string>()
    return new Map(roomExplication(shown, (id) => resolvePremise(id)?.number ?? null).map((r) => [r.roomId, r.number]))
  }, [shown, resolvePremise])
  const drawing = useMemo(() => (shown ? buildFloorDrawing(shown, (id) => resolvePremise(id)?.number ?? null, "edit", { roomNumbers: numbers }) : null), [shown, resolvePremise, numbers])

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
    if (process.env.NODE_ENV !== "production") (window as unknown as { __planView?: View | null }).__planView = view
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
    const map: Record<Hit["kind"], Selection["type"]> = { node: "node", opening: "opening", stair: "stair", annotation: "annotation", "mep-device": "mep-device", wall: "wall", room: "room" }
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
    if (L < spec.width + 200) return
    const t = closestOnSegment(p, a, b).t
    const offset = Math.round(Math.max(spec.width / 2 + 50, Math.min(L - spec.width / 2 - 50, t * L)))
    execute(new AddOpeningCommand(floor.id, { id: uid("op"), wallId, type, variant: spec.variant, width: spec.width, height: spec.height, sillHeight: spec.sill, offset, ...(replanMode ? { phase: "new" as const } : {}) }))
  }

  function placeStair(p: Vec2) {
    if (!floor || !building) return
    const upper = building.floors.filter((fl) => fl.elevation > floor.elevation).sort((x, y) => x.elevation - y.elevation)[0]
    if (stairShape === "porch") {
      // крыльцо к ближайшей стене снаружи, ступенями от здания
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
      execute(new AddStairCommand(floor.id, { id: uid("st"), shape: "porch", fromFloorId: floor.id, toFloorId: floor.id, position, rotationDeg: Math.round((Math.atan2(best.n.x, best.n.y) * 180) / Math.PI), width: 1800, railing: false, rise }))
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
    const snap = drawing ? snapPoint(floor, at.p, prev, tolMm, snapEnabled && !e.altKey) : null
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
      const t = snapPoint(others, at.p, null, tolMm, snapEnabled).p
      setPreview(findFloor(new MoveNodeCommand(floor.id, d.id, t).apply(doc), floor.id) ?? null)
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
    if (d.kind === "stair") {
      if (!d.moved && !far) return
      d.moved = true
      let x = d.origin.x + at.p.x - d.from.x, y = d.origin.y + at.p.y - d.from.y
      if (snapEnabled) { x = Math.round(x / 50) * 50; y = Math.round(y / 50) * 50 }
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
    if (d.kind === "wall" || d.kind === "node" || d.kind === "opening" || d.kind === "stair") {
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
      } else if (d.kind === "stair") {
        let x = d.origin.x + at.p.x - d.from.x, y = d.origin.y + at.p.y - d.from.y
        if (snapEnabled) { x = Math.round(x / 50) * 50; y = Math.round(y / 50) * 50 }
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
    setView(zoomAt(v, at.s, Math.exp(-e.deltaY * 0.0015)))
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
  const fontPx = Math.max(9, Math.min(13, px(260)))
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
    : tool === "stair" ? `${stairShape === "elevator" ? "Лифт" : stairShape === "porch" ? "Крыльцо: клик снаружи у стены" : "Лестница"}: клик на плане`
    : tool === "annotate" ? (annotateKind === "text" ? "Надпись: клик" : dimPts.length === 0 ? "Размер: первая точка" : dimPts.length === 1 ? "Размер: вторая точка" : "Размер: клик — вынос размерной линии")
    : tool === "delete" ? "Удалить: клик по элементу (в перепланировке существующее помечается демонтажем)"
    : tool === "select" ? "Клик — выделить, тянуть выделенное — сдвинуть · рамка → внутри, ← задетые · Shift — добавить · ПКМ — панорама · F — вписать"
    : tool === "measure" ? (measured ? `Рулетка: ${Math.round(Math.hypot(measured.b.x - measured.a.x, measured.b.y - measured.a.y))} мм · клик — новый замер` : pts2.length ? "Рулетка: вторая точка" : "Рулетка: первая точка (привязка к узлам и стенам)")
    : tool === "section" ? (pts2.length ? "Разрез: вторая точка линии" : "Разрез: первая точка линии")
    : tool === "mep-run" ? `Трасса ${MEP_SYSTEM_INFO[mepSystem].name}: клики — точки${pts2.length ? `, ${(polylineLengthMm(pts2) / 1000).toFixed(2)} м` : ""}; клик в последней точке, правая кнопка или Enter — готово`
    : tool === "mep-device" ? `${MEP_DEVICE_BY_KIND[mepDeviceKind]?.name ?? "Прибор"}: клик; настенные встают на ближайшую стену`
    : "Этот инструмент работает в 3D — переключитесь кнопкой «3D»"

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 z-[5] select-none"
      style={{ background: "#eef1f5", cursor: tool === "select" ? "default" : "crosshair" }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="plan-editor"
    >
      <svg width={size.w} height={size.h} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel} style={{ display: "block", touchAction: "none" }}>
        <defs>
          <pattern id="pe-hatch" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} stroke="#15803d" strokeWidth={1.2} />
          </pattern>
        </defs>
        {gridX.map((x) => { const s = S({ x, y: 0 }); return <line key={`gx${x}`} x1={s.x} y1={0} x2={s.x} y2={size.h} stroke={x === 0 ? "#cbd5e1" : "#e2e8f0"} strokeWidth={1} /> })}
        {gridY.map((y) => { const s = S({ x: 0, y }); return <line key={`gy${y}`} x1={0} y1={s.y} x2={size.w} y2={s.y} stroke={y === 0 ? "#cbd5e1" : "#e2e8f0"} strokeWidth={1} /> })}

        {u && (() => {
          const h = u.widthMm / (u.aspect || 1)
          const tl = S({ x: u.x, y: u.y + h })
          const cx = tl.x + px(u.widthMm) / 2, cy = tl.y + px(h) / 2
          return <image href={u.url} x={tl.x} y={tl.y} width={px(u.widthMm)} height={px(h)} opacity={u.opacity} preserveAspectRatio="none" transform={`rotate(${u.rotationDeg} ${cx} ${cy})`} style={{ pointerEvents: "none" }} />
        })()}

        {/* помещения: заливка по статусу аренды */}
        {rooms.map((r) => {
          const link = floor.premiseLinks[r.id]
          const premise = link ? resolvePremise(link) : undefined
          const fill = premise ? `${STATUS_COLOR[premise.status]}33` : "#ffffff"
          const selected = sel.type === "room" && sel.id === r.id
          return <polygon key={r.id} points={pts(r.polygon)} fill={fill} stroke={selected ? TOKENS.accent : "none"} strokeWidth={selected ? 3 : 0} />
        })}

        {/* стены */}
        {drawing.wallSolids.map((q, i) => {
          const st = drawing.wallStyles[i]
          if (st === "demolish") return <polygon key={`w${i}`} points={pts(q)} fill="#fee2e2" stroke="#dc2626" strokeWidth={1.2} strokeDasharray="5 3" />
          if (st === "new") return <polygon key={`w${i}`} points={pts(q)} fill="url(#pe-hatch)" stroke="#15803d" strokeWidth={1.2} />
          return <polygon key={`w${i}`} points={pts(q)} fill="#1e293b" />
        })}
        {drawing.thinLines.map(([a, b], i) => { const p = S(a), q = S(b); return <line key={`t${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#334155" strokeWidth={1} /> })}
        {drawing.arcs.map((a, i) => {
          const r = px(a.r)
          const s0 = S({ x: a.c.x + a.r * Math.cos((a.start * Math.PI) / 180), y: a.c.y + a.r * Math.sin((a.start * Math.PI) / 180) })
          const s1 = S({ x: a.c.x + a.r * Math.cos((a.end * Math.PI) / 180), y: a.c.y + a.r * Math.sin((a.end * Math.PI) / 180) })
          return <path key={`a${i}`} d={`M ${s0.x} ${s0.y} A ${r} ${r} 0 0 0 ${s1.x} ${s1.y}`} fill="none" stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" />
        })}

        {/* лестницы, лифты, выходы */}
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
        {drawing.exits.map((ex, i) => {
          const a = S(ex.at)
          const dir = { x: ex.dir.x, y: -ex.dir.y }
          const L = Math.max(22, px(1200))
          const tip = { x: a.x + dir.x * L, y: a.y + dir.y * L }
          const color = ex.kind === "emergency" ? "#16a34a" : "#2563eb"
          return (
            <g key={`ex${i}`} stroke={color} fill={color}>
              <line x1={a.x} y1={a.y} x2={tip.x} y2={tip.y} strokeWidth={3} />
              <polygon points={`${tip.x},${tip.y} ${tip.x - dir.x * 11 - dir.y * 6},${tip.y - dir.y * 11 + dir.x * 6} ${tip.x - dir.x * 11 + dir.y * 6},${tip.y - dir.y * 11 - dir.x * 6}`} stroke="none" />
              <text x={tip.x + dir.x * 18} y={tip.y + dir.y * 18} fontSize={fontPx} textAnchor="middle" dominantBaseline="middle" stroke="none" fontWeight={700}>{ex.kind === "emergency" ? "ВЫХОД" : "ВХОД"}</text>
            </g>
          )
        })}

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
        {rooms.map((r) => {
          let cx = 0, cy = 0
          for (const q of r.polygon) { cx += q.x; cy += q.y }
          const c = S({ x: cx / r.polygon.length, y: cy / r.polygon.length })
          const link = floor.premiseLinks[r.id]
          const premise = link ? resolvePremise(link) : undefined
          const name = floor.roomNames?.[r.id]
          const area = `${(r.areaMm2 / 1e6).toFixed(1).replace(".", ",")} м²`
          if (px(Math.sqrt(r.areaMm2)) < 40) return null
          return (
            <g key={`lbl${r.id}`} style={{ pointerEvents: "none" }} fontSize={fontPx} textAnchor="middle">
              <text x={c.x} y={c.y - fontPx * 0.9} fontWeight={700} fill="#0f172a">{numbers.get(r.id) ? `№ ${numbers.get(r.id)}` : ""}{name ? ` · ${name}` : ""}</text>
              {premise?.tenantName && <text x={c.x} y={c.y + 2} fill="#334155">{shortTenantName(premise.tenantName)}</text>}
              <text x={c.x} y={c.y + fontPx * (premise?.tenantName ? 1.2 : 0.4)} fill="#475569" textDecoration="underline">{area}</text>
            </g>
          )
        })}

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
        {snapMark && (cursor?.snap?.kind === "node"
          ? <rect x={snapMark.x - 6} y={snapMark.y - 6} width={12} height={12} fill="none" stroke="#16a34a" strokeWidth={2} />
          : <polygon points={`${snapMark.x},${snapMark.y - 7} ${snapMark.x + 7},${snapMark.y} ${snapMark.x},${snapMark.y + 7} ${snapMark.x - 7},${snapMark.y}`} fill="none" stroke="#ea580c" strokeWidth={2} />)}
      </svg>

      <div className="pointer-events-none absolute bottom-[5.5rem] left-1/2 -translate-x-1/2 rounded-lg px-3 py-1.5 text-xs font-medium shadow" style={{ background: "rgba(15,23,42,0.85)", color: "#e2e8f0" }}>
        {hint}
      </div>
      <div className="pointer-events-none absolute bottom-9 left-[13.5rem] rounded-md px-2 py-0.5 text-[11px] tabular-nums" style={{ background: "rgba(255,255,255,0.85)", color: "#334155" }}>
        {cursor ? `X ${(cursor.plan.x / 1000).toFixed(2)}  Y ${(cursor.plan.y / 1000).toFixed(2)} м` : ""} · 1 м = {px(1000).toFixed(0)} px
      </div>
    </div>
  )
}
