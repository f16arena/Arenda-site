"use client"

// ADR: Оркестратор редактора. Раскладка (тулбар/уровни/свойства/каталог/камера/статус),
// загрузочный экран, хоткеи и двусторонняя связка стора с движком. Канвас грузится
// динамически (ssr:false). Свежие данные движок берёт через getState — без устаревших
// замыканий и лишних пересозданий колбэков.

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import type { BuilderDocument } from "@/types/builder"
import { useDocumentStore, useEditorStore, useSyncStore, type Tool, type CameraMode } from "@/store/builder-store"
import { loadBuilderProject } from "@/app/actions/builder"
import type { BuilderEngine, MeshMeta } from "@/engine/engine"
import { AddObjectCommand, DeleteObjectCommand, MoveObjectCommand, DeleteWallCommand, DeleteWaterCommand, DeletePathCommand, DeletePavementCommand, DeleteStairCommand, DeleteOpeningCommand, DeleteMepRunCommand, DeleteMepDeviceCommand, UpdateMepDeviceCommand, DeleteSectionCommand, replanDeleteWall, replanDeleteOpening, TransformWallsCommand, DeleteAnnotationCommand, CompositeCommand, type Command } from "@/core/document/commands"
import { uid } from "@/core/id"
import { listBuildingPremises } from "@/app/actions/builder-premise"
import { usePremiseStore } from "@/store/premise-store"
import { useLabelStore } from "@/store/label-store"
import { useUnderlayIntent } from "@/store/underlay-intent"
import { moveUnderlay } from "@/lib/builder/underlay-math"
import { findFloor, SetUnderlayCommand } from "@/core/document/commands"
import { LabelLayer } from "./LabelLayer"
import type { PremiseStatus } from "@/lib/builder/materials"
import { DEMO_PREMISE_STATUS } from "@/lib/builder/demo-project"
import { TOKENS } from "@/lib/builder/materials"
import { BuilderToolbar } from "./BuilderToolbar"
import { ModeSwitcher } from "./ModeSwitcher"
import { ToolOptions } from "./ToolOptions"
import { BuilderProjectBar } from "./BuilderProjectBar"
import { LevelPanel } from "./LevelPanel"
import { PropertyPanel } from "./PropertyPanel"
import { AssetCatalog } from "./AssetCatalog"
import { MepPanel } from "./MepPanel"
import { PlanEditor } from "./PlanEditor"
import { CameraControls } from "./CameraControls"
import { ViewCube } from "./ViewCube"
import { MiniMap } from "./MiniMap"
import { PerfHud } from "./PerfHud"
import { ShowcaseLead } from "./ShowcaseLead"
import { StatusBar } from "./StatusBar"

const BuilderCanvas = dynamic(() => import("./BuilderCanvas").then((m) => m.BuilderCanvas), { ssr: false })

function applyPick(meta: MeshMeta | null): void {
  const setSelection = useEditorStore.getState().setSelection
  if (!meta || !meta.entityId) {
    setSelection({ type: "none" })
    return
  }
  // Клик по стене/комнате/проёму другого этажа делает этот этаж активным: иначе
  // правка шла бы по плоскости чужого этажа, а ручки и размеры — не те.
  const ed = useEditorStore.getState()
  if (meta.floorId && meta.kind !== "object" && ed.activeLevelId !== meta.floorId) ed.setActiveLevel(meta.floorId)
  if (meta.kind === "wall") setSelection({ type: "wall", id: meta.entityId, floorId: meta.floorId })
  else if (meta.kind === "room") setSelection({ type: "room", id: meta.entityId, floorId: meta.floorId })
  else if (meta.kind === "opening") setSelection({ type: "opening", id: meta.entityId, floorId: meta.floorId })
  else if (meta.kind === "stair") setSelection({ type: "stair", id: meta.entityId, floorId: meta.floorId })
  else if (meta.kind === "object") setSelection({ type: "object", id: meta.entityId, floorId: meta.target !== "site" ? meta.target : undefined })
  else if (meta.kind === "water") setSelection({ type: "water", id: meta.entityId })
  else if (meta.kind === "path") setSelection({ type: "path", id: meta.entityId })
  else if (meta.kind === "pavement") setSelection({ type: "pavement", id: meta.entityId })
  else if (meta.kind === "annotation") setSelection({ type: "annotation", id: meta.entityId, floorId: meta.floorId })
  else if (meta.kind === "section") setSelection({ type: "section", id: meta.entityId, buildingId: meta.target })
  else if (meta.kind === "mep-run") setSelection({ type: "mep-run", id: meta.entityId, floorId: meta.floorId })
  else if (meta.kind === "mep-device") setSelection({ type: "mep-device", id: meta.entityId, floorId: meta.floorId })
  else setSelection({ type: "none" })
}

// Буфер копирования объекта (Ctrl+C/Ctrl+V) — на уровне модуля, живёт между рендерами.
let objectClipboard: import("@/types/builder").BuilderObject | null = null

function objTarget(doc: BuilderDocument, id: string): { target: { site: true } | { floorId: string }; obj: import("@/types/builder").BuilderObject } | null {
  const inSite = doc.site.objects.find((o) => o.id === id)
  if (inSite) return { target: { site: true }, obj: inSite }
  for (const b of doc.buildings) for (const f of b.floors) {
    const o = f.objects.find((ob) => ob.id === id)
    if (o) return { target: { floorId: f.id }, obj: o }
  }
  return null
}

function wallFloor(doc: BuilderDocument, edgeId: string): string | null {
  for (const b of doc.buildings) for (const f of b.floors) if (f.wallGraph.edges[edgeId]) return f.id
  return null
}

// Групповое удаление объектов и стен — одним шагом истории: Ctrl+Z возвращает всё сразу.
function groupDelete(ids: string[]): void {
  const d = useDocumentStore.getState().doc
  const commands = ids.flatMap((id): Command[] => {
    const t = objTarget(d, id)
    if (t) return [new DeleteObjectCommand(t.target, id)]
    const fid = wallFloor(d, id)
    const cmd = fid ? replanDeleteWall(d, fid, id, useEditorStore.getState().replanMode) : null
    return cmd ? [cmd] : []
  })
  if (commands.length) useDocumentStore.getState().execute(new CompositeCommand(`удаление: ${commands.length}`, commands))
  useEditorStore.getState().clearMulti()
}

/** Сдвиг/копия/поворот/зеркало выделенных стен одного этажа; выделение переходит на результат. */
function groupWalls(xf: import("@/lib/builder/wall-transform").WallXf, copy: boolean): void {
  const d = useDocumentStore.getState().doc
  const ids = useEditorStore.getState().multi
  const byFloor = new Map<string, string[]>()
  for (const id of ids) {
    const fid = wallFloor(d, id)
    if (fid) byFloor.set(fid, [...(byFloor.get(fid) ?? []), id])
  }
  const [fid, walls] = [...byFloor.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? []
  if (!fid || !walls?.length) return
  const cmd = new TransformWallsCommand(fid, walls, xf, copy)
  useDocumentStore.getState().execute(cmd)
  if (cmd.createdIds.length) useEditorStore.getState().setMulti(cmd.createdIds)
}

function WallGroupBar() {
  const [dx, setDx] = useState("0")
  const [dy, setDy] = useState("0")
  const m = (v: string) => Math.round((parseFloat(v.replace(",", ".")) || 0) * 1000)
  const btn = "rounded-md px-2 py-1 text-xs"
  const style = { background: TOKENS.panelBorder, color: TOKENS.text }
  const input = "w-14 rounded-md bg-white/5 px-1.5 py-1 text-xs"
  return (
    <div className="flex items-center gap-1.5" title="Как MOVE/COPY/ROTATE/MIRROR в AutoCAD: смещение в метрах по осям плана">
      <label className="flex items-center gap-1 text-[11px] font-normal" style={{ color: TOKENS.muted }}>
        ΔX<input id="group-dx" value={dx} onChange={(e) => setDx(e.target.value)} className={input} style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
      </label>
      <label className="flex items-center gap-1 text-[11px] font-normal" style={{ color: TOKENS.muted }}>
        ΔY<input id="group-dy" value={dy} onChange={(e) => setDy(e.target.value)} className={input} style={{ color: TOKENS.text, border: `1px solid ${TOKENS.panelBorder}` }} />
      </label>
      <button type="button" className={btn} style={style} onClick={() => groupWalls({ kind: "move", dx: m(dx), dy: m(dy) }, false)}>Сдвинуть</button>
      <button type="button" className={btn} style={style} onClick={() => groupWalls({ kind: "move", dx: m(dx), dy: m(dy) }, true)}>Копия</button>
      <button type="button" className={btn} style={style} onClick={() => groupWalls({ kind: "rotate", deg: 90 }, false)} title="Поворот на 90° против часовой вокруг центра выделения">⟲ 90°</button>
      <button type="button" className={btn} style={style} onClick={() => groupWalls({ kind: "mirror", axis: "vertical" }, false)} title="Зеркально слева направо">⇋</button>
      <button type="button" className={btn} style={style} onClick={() => groupWalls({ kind: "mirror", axis: "horizontal" }, false)} title="Зеркально сверху вниз">⇅</button>
    </div>
  )
}

function groupDuplicate(ids: string[]): void {
  const exec = useDocumentStore.getState().execute
  const d = useDocumentStore.getState().doc
  for (const id of ids) {
    const t = objTarget(d, id)
    if (t) exec(new AddObjectCommand(t.target, { ...t.obj, id: uid("o"), position: { ...t.obj.position, x: t.obj.position.x + 800, z: t.obj.position.z + 800 } }))
  }
}

function groupAlign(ids: string[], axis: "x" | "z"): void {
  const exec = useDocumentStore.getState().execute
  const d = useDocumentStore.getState().doc
  const items = ids.map((id) => objTarget(d, id)).filter(Boolean) as { target: { site: true } | { floorId: string }; obj: import("@/types/builder").BuilderObject }[]
  if (items.length < 2) return
  const avg = Math.round(items.reduce((s, it) => s + (axis === "x" ? it.obj.position.x : it.obj.position.z), 0) / items.length)
  for (const it of items) {
    const x = axis === "x" ? avg : it.obj.position.x
    const z = axis === "z" ? avg : it.obj.position.z
    exec(new MoveObjectCommand(it.target, it.obj.id, x, z))
  }
}

function deleteSelection(): void {
  const sel = useEditorStore.getState().selection
  const exec = useDocumentStore.getState().execute
  const d = useDocumentStore.getState().doc
  const replan = useEditorStore.getState().replanMode
  if (sel.type === "wall" && sel.floorId && sel.id) {
    const cmd = replanDeleteWall(d, sel.floorId, sel.id, replan)
    if (!cmd) return
    exec(cmd)
    // помеченная под демонтаж стена остаётся выделенной — видно, что произошло
    if (replan) return
  }
  else if (sel.type === "water" && sel.id) exec(new DeleteWaterCommand(sel.id))
  else if (sel.type === "path" && sel.id) exec(new DeletePathCommand(sel.id))
  else if (sel.type === "pavement" && sel.id) exec(new DeletePavementCommand(sel.id))
  else if (sel.type === "stair" && sel.floorId && sel.id) exec(new DeleteStairCommand(sel.floorId, sel.id))
  else if (sel.type === "opening" && sel.floorId && sel.id) {
    const cmd = replanDeleteOpening(d, sel.floorId, sel.id, replan)
    if (!cmd) return
    exec(cmd)
    if (replan) return
  }
  else if (sel.type === "section" && sel.buildingId && sel.id) exec(new DeleteSectionCommand(sel.buildingId, sel.id))
  else if (sel.type === "annotation" && sel.floorId && sel.id) exec(new DeleteAnnotationCommand(sel.floorId, sel.id))
  else if (sel.type === "mep-run" && sel.floorId && sel.id) exec(new DeleteMepRunCommand(sel.floorId, sel.id))
  else if (sel.type === "mep-device" && sel.floorId && sel.id) exec(new DeleteMepDeviceCommand(sel.floorId, sel.id))
  else if (sel.type === "object" && sel.id) {
    const inSite = d.site.objects.some((o) => o.id === sel.id)
    exec(new DeleteObjectCommand(inSite ? { site: true } : { floorId: sel.floorId ?? "" }, sel.id))
  } else return
  useEditorStore.getState().setSelection({ type: "none" })
}

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  w: "wall",
  r: "room",
  f: "floor",
  d: "door",
  n: "window",
  s: "stair",
  t: "roof",
  o: "object",
  m: "material",
}
const CAM_KEYS: Record<string, CameraMode> = { "1": "orbit", "2": "top", "3": "plan2d", "4": "walk" }

export function BuilderApp({ initialProjectId, initialDoc, readOnly, showcaseName, shareToken, buildingId }: { initialProjectId?: string; initialDoc?: BuilderDocument; readOnly?: boolean; showcaseName?: string; shareToken?: string; buildingId?: string }) {
  const engineRef = useRef<BuilderEngine | null>(null)
  const [ready, setReady] = useState(false)
  const [premiseReady, setPremiseReady] = useState(0)
  // Статус комнаты: по id карточки (так связывает сборка из данных), потом по
  // номеру (старая ручная привязка). Демо-таблица — только у демо-сцены без здания.
  const resolveStatus = useCallback(
    (pid: string): PremiseStatus | undefined =>
      usePremiseStore.getState().resolve(pid)?.status ?? (buildingId ? undefined : DEMO_PREMISE_STATUS[pid]),
    [buildingId],
  )

  const [hud, setHud] = useState<string | null>(null)
  const [box, setBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // счётчик FPS мешает инженеру и перекрывал «Размеры»; для отладки — ?perf
  const [showPerf] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perf"))
  // Последний отрезок рулетки — панель подложки спросит его настоящую длину
  const [measure, setMeasure] = useState<{ lengthMm: number; from: { x: number; y: number } } | null>(null)
  const doc = useDocumentStore((s) => s.doc)
  const rev = useDocumentStore((s) => s.rev)
  const activeTool = useEditorStore((s) => s.activeTool)
  const cameraMode = useEditorStore((s) => s.cameraMode)
  const displayMode = useEditorStore((s) => s.displayMode)
  const wallsDown = useEditorStore((s) => s.wallsDown)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const selection = useEditorStore((s) => s.selection)
  const multi = useEditorStore((s) => s.multi)
  const paintMaterialId = useEditorStore((s) => s.paintMaterialId)
  const stairShape = useEditorStore((s) => s.stairShape)
  const terrainMode = useEditorStore((s) => s.terrainMode)
  const waterDepth = useEditorStore((s) => s.waterDepth)
  const pathKind = useEditorStore((s) => s.pathKind)
  const pathWidth = useEditorStore((s) => s.pathWidth)
  const fenceStyle = useEditorStore((s) => s.fenceStyle)
  const paveMaterial = useEditorStore((s) => s.paveMaterial)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const wallArc = useEditorStore((s) => s.wallArc)
  const mepSystem = useEditorStore((s) => s.mepSystem)
  const mepDeviceKind = useEditorStore((s) => s.mepDeviceKind)
  const mepLayers = useEditorStore((s) => s.mepLayers)
  const replanMode = useEditorStore((s) => s.replanMode)
  const annotateKind = useEditorStore((s) => s.annotateKind)
  const armedAsset = useEditorStore((s) => s.armedAsset)
  const openingVariant = useEditorStore((s) => s.openingVariant)
  const mode = useEditorStore((s) => s.mode)
  const gizmoMode = useEditorStore((s) => s.gizmoMode)
  const turbo = useEditorStore((s) => s.turbo)

  const handleReady = useCallback((engine: BuilderEngine) => {
    engineRef.current = engine
    // локальный стенд и отладка: движок доступен из консоли, в проде — нет
    if (process.env.NODE_ENV !== "production") (window as unknown as { __engine?: BuilderEngine }).__engine = engine
    engine.statusResolver = resolveStatus
    engine.getDoc = () => useDocumentStore.getState().doc
    engine.onCommand = readOnly ? () => {} : (cmd) => useDocumentStore.getState().execute(cmd)
    engine.onPick = (meta) => applyPick(meta)
    engine.onMultiToggle = (id) => {
      const ed = useEditorStore.getState()
      // Shift+клик ко второй стене: первая, выбранная обычным кликом, остаётся в наборе
      if (ed.multi.length === 0 && ed.selection.id && ed.selection.id !== id && (ed.selection.type === "wall" || ed.selection.type === "object")) {
        useEditorStore.setState({ multi: [ed.selection.id], selection: { type: "none" } })
      }
      useEditorStore.getState().toggleMulti(id)
    }
    engine.onBox = (rect) => setBox(rect)
    engine.onBoxSelect = (ids, additive) => {
      const ed = useEditorStore.getState()
      const base = additive ? ed.multi : []
      const next = [...new Set([...base, ...ids])]
      if (next.length === 1) ed.setSelection({ type: "wall", id: next[0], floorId: ed.activeLevelId ?? undefined })
      else useEditorStore.setState({ multi: next, selection: { type: "none" } })
    }
    engine.onObjectBaseSizes = (sizes) => useEditorStore.getState().setAssetBaseSizes(sizes)
    // Инструмент «Помещение» просто выбирает комнату — карточка выбирается
    // в панели свойств из списка помещений этого здания, а не вводится номером.
    engine.onLinkRoom = (floorId, roomId) => applyPick({ kind: "room", floorId, entityId: roomId })
    engine.onHud = (t) => setHud(t)
    engine.onMeasure = (lengthMm, from, to) => {
      // «Совместить»: точка скана встаёт в точку модели сразу, без вопросов.
      // «Калибровать»: панель подложки спросит настоящую длину отрезка.
      const intent = useUnderlayIntent.getState().intent
      const floorId = useEditorStore.getState().activeLevelId
      const floor = floorId ? findFloor(useDocumentStore.getState().doc, floorId) : undefined
      if (intent === "move" && floor?.underlay) {
        useDocumentStore.getState().execute(new SetUnderlayCommand(floor.id, moveUnderlay(floor.underlay, from, to)))
        useUnderlayIntent.getState().setIntent(null)
        useEditorStore.getState().setTool("select")
        setHud("Подложка совмещена")
        window.setTimeout(() => setHud(null), 1500)
        return
      }
      if (intent === "calibrate") {
        useUnderlayIntent.getState().setIntent(null)
        useEditorStore.getState().setTool("select")
      }
      setMeasure({ lengthMm, from })
    }
    engine.onLabels = (labels) => useLabelStore.getState().setLabels(labels)
    engine.onLowFps = () => {
      if (useEditorStore.getState().turbo) return
      useEditorStore.getState().setTurbo(true)
      setHud("Кадров мало — включён лёгкий режим 3D (без теней и свечения)")
      window.setTimeout(() => setHud(null), 4000)
    }
    engine.onCursor = (mm) => useLabelStore.getState().setCursor(mm)
    if (initialDoc) {
      useDocumentStore.getState().loadDocument(initialDoc)
      const f = initialDoc.buildings[0]?.floors?.[0]
      if (f) useEditorStore.getState().setActiveLevel(f.id)
    } else {
      const d = useDocumentStore.getState().doc
      const first = d.buildings[0]?.floors?.[0]
      if (first) useEditorStore.getState().setActiveLevel(first.id)
    }
    setReady(true)
  }, [readOnly, initialDoc, resolveStatus])

  // Пересборка сцены при изменении документа/уровня/режима отображения.
  useEffect(() => {
    const e = engineRef.current
    if (!e || !ready) return
    e.activeFloorId = activeLevelId
    e.statusResolver = resolveStatus
    e.rebuild(doc, { activeLevelId, displayMode, wallsDown, mepLayers, mepFocus: mode === "mep" })
    e.setSelection(useEditorStore.getState().selection)
  }, [ready, rev, activeLevelId, displayMode, wallsDown, doc, premiseReady, resolveStatus, mepLayers, mode])

  useEffect(() => {
    const e = engineRef.current
    if (e && ready) e.setSelection(selection)
  }, [selection, ready])

  useEffect(() => {
    const e = engineRef.current
    if (e && ready) e.setMulti(multi)
  }, [multi, ready])

  useEffect(() => {
    const e = engineRef.current
    if (e && ready) e.setGizmoMode(gizmoMode)
  }, [gizmoMode, ready])

  useEffect(() => {
    const e = engineRef.current
    if (e && ready) e.setTurbo(turbo)
  }, [turbo, ready])

  useEffect(() => {
    const e = engineRef.current
    if (!e || !ready) return
    e.tool = activeTool
    e.paintMaterialId = paintMaterialId
    e.stairShape = stairShape
    e.terrainMode = terrainMode
    e.waterDepth = waterDepth
    e.pathKind = activeTool === "fence" ? "fence" : pathKind
    e.pathWidth = pathWidth
    e.fenceStyle = fenceStyle
    e.paveMaterial = paveMaterial
    e.snapEnabled = snapEnabled
    e.wallArc = wallArc
    e.mepSystem = mepSystem
    e.replanMode = replanMode
    e.mepDeviceKind = mepDeviceKind
    e.openingType = activeTool === "window" ? "window" : "door"
    e.openingVariant = openingVariant
    e.setArmedAsset(activeTool === "object" ? armedAsset : null)
    // ушли с рулетки другим инструментом — намерение подложки сгорает
    if (activeTool !== "measure") useUnderlayIntent.getState().setIntent(null)
    if (activeTool !== "wall") e.cancelWallTool()
    if (activeTool !== "water") e.cancelWater()
    if (activeTool !== "road" && activeTool !== "fence") e.cancelPath()
    if (activeTool !== "pave") e.cancelPave()
    if (activeTool !== "mep-run") e.cancelMep()
    if (activeTool !== "section") e.cancelSection()
    if (activeTool !== "annotate") e.cancelAnnotate()
    e.annotateKind = annotateKind
  }, [activeTool, paintMaterialId, stairShape, terrainMode, waterDepth, pathKind, pathWidth, fenceStyle, paveMaterial, snapEnabled, wallArc, mepSystem, mepDeviceKind, replanMode, annotateKind, armedAsset, openingVariant, ready])

  useEffect(() => {
    const e = engineRef.current
    // редактор плана рисует сам — 3D-сцена ждёт под ним на паузе и не грузит видеокарту
    if (!e || !ready) return
    e.setPaused(cameraMode === "plan2d")
    if (cameraMode !== "plan2d") e.setCameraMode(cameraMode)
  }, [cameraMode, ready])

  // Помещения этого здания: статусы для окраски полов и карточки для панели.
  useEffect(() => {
    if (readOnly || !buildingId) return
    let cancelled = false
    void listBuildingPremises(buildingId)
      .then((rows) => {
        if (cancelled) return
        usePremiseStore.getState().setRows(rows)
        setPremiseReady((n) => n + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [readOnly, buildingId])

  // Загрузка сохранённого проекта по ?project (иначе остаётся demo).
  useEffect(() => {
    if (!ready || !initialProjectId) return
    let cancelled = false
    void loadBuilderProject(initialProjectId)
      .then((p) => {
        if (cancelled || !p) return
        useDocumentStore.getState().loadDocument(p.doc)
        useSyncStore.getState().setProject(p.id, p.name, p.revision)
        // только что загруженное — уже сохранено: без этого автосейв сразу
        // отправлял неизменённую модель (с тяжёлыми сканами) обратно на сервер
        useSyncStore.setState({ lastSavedRev: useDocumentStore.getState().rev })
        const first = p.doc.buildings[0]?.floors?.[0]
        if (first) useEditorStore.getState().setActiveLevel(first.id)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [ready, initialProjectId])

  useEffect(() => {
    if (!ready) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      const ed = useEditorStore.getState()
      const docState = useDocumentStore.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) docState.redo()
        else docState.undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault()
        docState.redo()
        return
      }
      // Ctrl+C — скопировать выбранный объект в буфер
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const sel = ed.selection
        if (sel.type === "object" && sel.id) {
          const t = objTarget(docState.doc, sel.id)
          if (t) {
            objectClipboard = t.obj
            setHud("Объект скопирован — Ctrl+V вставит")
            window.setTimeout(() => setHud(null), 1500)
          }
        }
        return
      }
      // Ctrl+V — вставить объект из буфера на активный уровень со смещением
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        if (objectClipboard) {
          e.preventDefault()
          const d = docState.doc
          const onFloor = d.buildings.flatMap((b) => b.floors).some((f) => f.id === ed.activeLevelId)
          const target = onFloor ? ({ floorId: ed.activeLevelId } as const) : ({ site: true } as const)
          const newId = uid("o")
          docState.execute(new AddObjectCommand(target, { ...objectClipboard, id: newId, position: { ...objectClipboard.position, x: objectClipboard.position.x + 800, z: objectClipboard.position.z + 800 } }))
          ed.setSelection({ type: "object", id: newId, floorId: onFloor ? ed.activeLevelId : undefined })
        }
        return
      }
      // Ctrl+D — дублировать выбранный объект
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault()
        if (ed.multi.length) {
          groupDuplicate(ed.multi)
          return
        }
        const sel = ed.selection
        if (sel.type === "object" && sel.id) {
          const d = docState.doc
          const inSite = d.site.objects.find((o) => o.id === sel.id)
          const floorRec = !inSite ? d.buildings.flatMap((b) => b.floors).map((f) => ({ f, o: f.objects.find((ob) => ob.id === sel.id) })).find((x) => x.o) : null
          const obj = inSite ?? floorRec?.o
          if (obj) {
            const target = inSite ? ({ site: true } as const) : ({ floorId: floorRec?.f.id ?? "" } as const)
            const id = uid("o")
            docState.execute(new AddObjectCommand(target, { ...obj, id, position: { ...obj.position, x: obj.position.x + 800, z: obj.position.z + 800 } }))
            ed.setSelection({ type: "object", id, floorId: sel.floorId })
          }
        }
        return
      }
      // Ввод длины стены имеет приоритет над хоткеями (цифры = пресеты камеры).
      const eng = engineRef.current
      if (eng && eng.isDrawingWall() && (/^[0-9]$/.test(e.key) || e.key === "Backspace" || e.key === "Enter" || e.key === "," || e.key === ".")) {
        e.preventDefault()
        eng.handleLengthKey(e.key)
        return
      }
      // Enter — замкнуть контур водоёма.
      if (eng && eng.isDrawingWater() && e.key === "Enter") {
        e.preventDefault()
        eng.finalizeWater()
        return
      }
      // Enter — завершить линию (дорога/забор).
      if (eng && eng.isDrawingPath() && e.key === "Enter") {
        e.preventDefault()
        eng.finalizePath()
        return
      }
      // Enter — завершить трассу сети.
      if (eng && eng.isDrawingMep() && e.key === "Enter") {
        e.preventDefault()
        eng.finalizeMep()
        return
      }
      // Enter — залить площадку.
      if (eng && eng.isDrawingPave() && e.key === "Enter") {
        e.preventDefault()
        eng.finalizePave()
        return
      }
      // R — поворот объекта в режиме размещения
      if ((e.key === "r" || e.key === "R") && ed.activeTool === "object" && ed.armedAsset) {
        engineRef.current?.rotatePlacer(45)
        return
      }
      // Стрелки — сдвиг выбранного прибора сети (Shift — 10 мм).
      if (e.key.startsWith("Arrow") && ed.selection.type === "mep-device" && ed.selection.id && ed.selection.floorId) {
        e.preventDefault()
        const fl = findFloor(docState.doc, ed.selection.floorId)
        const dev = fl?.mepDevices.find((d) => d.id === ed.selection.id)
        if (dev) {
          const step = e.shiftKey ? 10 : 100
          const at = { ...dev.at }
          if (e.key === "ArrowUp") at.y -= step
          else if (e.key === "ArrowDown") at.y += step
          else if (e.key === "ArrowLeft") at.x -= step
          else at.x += step
          docState.execute(new UpdateMepDeviceCommand(ed.selection.floorId, dev.id, { at }, `move-${dev.id}`))
        }
        return
      }
      // Стрелки — точное смещение выбранного объекта (Shift — мелкий шаг).
      if (e.key.startsWith("Arrow") && ed.selection.type === "object" && ed.selection.id) {
        e.preventDefault()
        const t = objTarget(docState.doc, ed.selection.id)
        if (t) {
          const step = e.shiftKey ? 10 : 100
          let x = t.obj.position.x
          let z = t.obj.position.z
          if (e.key === "ArrowUp") z -= step
          else if (e.key === "ArrowDown") z += step
          else if (e.key === "ArrowLeft") x -= step
          else if (e.key === "ArrowRight") x += step
          docState.execute(new MoveObjectCommand(t.target, ed.selection.id, Math.round(x), Math.round(z)))
        }
        return
      }
      // G — тумблер привязки к сетке
      if (e.key === "g" || e.key === "G") {
        ed.toggleSnap()
        setHud(useEditorStore.getState().snapEnabled ? "Привязка к сетке: вкл" : "Привязка к сетке: выкл")
        window.setTimeout(() => setHud(null), 1200)
        return
      }
      const k = e.key.toLowerCase()
      if (TOOL_KEYS[k]) {
        ed.setTool(TOOL_KEYS[k])
        return
      }
      if (CAM_KEYS[e.key]) {
        ed.setCameraMode(CAM_KEYS[e.key])
        return
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault()
        if (ed.multi.length) groupDelete(ed.multi)
        else deleteSelection()
        return
      }
      if (e.key === "Escape") {
        // сначала — отменить перетаскивание, если оно идёт: выделение остаётся
        if (engineRef.current?.cancelDrag()) return
        engineRef.current?.cancelWallTool()
        engineRef.current?.cancelWater()
        engineRef.current?.cancelPath()
        engineRef.current?.cancelPave()
        engineRef.current?.cancelMep()
        engineRef.current?.cancelSection()
        engineRef.current?.cancelAnnotate()
        ed.armAsset(null)
        ed.setSelection({ type: "none" })
        return
      }
      if (e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault()
        const floors = docState.doc.buildings.flatMap((b) => b.floors).sort((a, b) => a.level - b.level)
        const idx = floors.findIndex((f) => f.id === ed.activeLevelId)
        const next = floors[idx + (e.key === "PageUp" ? 1 : -1)]
        if (next) ed.setActiveLevel(next.id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ready])

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden" style={{ background: TOKENS.background, color: TOKENS.text }}>
      <BuilderCanvas onReady={handleReady} />
      {!readOnly && ready && cameraMode === "plan2d" && <PlanEditor />}
      {!readOnly && <ModeSwitcher />}
      {!readOnly && <BuilderToolbar />}
      {!readOnly && <BuilderProjectBar onScreenshot={() => {
        const url = engineRef.current?.captureDataUrl()
        if (!url) return
        const a = document.createElement("a")
        a.href = url
        a.download = `${useSyncStore.getState().name || "building"}.png`
        document.body.appendChild(a)
        a.click()
        a.remove()
      }} />}
      {!readOnly && <ToolOptions />}
      {!readOnly && <LevelPanel measure={measure} onMeasureConsumed={() => setMeasure(null)} buildingId={buildingId} />}
      {!readOnly && ready && cameraMode !== "plan2d" && <LabelLayer />}
      <PropertyPanel buildingId={buildingId} />
      <CameraControls onFit={() => engineRef.current?.frameAll()} />
      <ViewCube
        onView={(a, b) => {
          // из плана/вида сверху в ракурс: сначала режим камеры, потом поворот
          useEditorStore.getState().setCameraMode("orbit")
          window.requestAnimationFrame(() => engineRef.current?.orbitTo(a, b))
        }}
      />
      {!readOnly && (mode === "mep" ? <MepPanel buildingId={buildingId} /> : <AssetCatalog key={mode} />)}
      {!readOnly && <MiniMap />}
      {!readOnly && ready && showPerf && <PerfHud getFps={() => engineRef.current?.getFps() ?? 0} />}
      {readOnly && selection.type === "room" && selection.floorId && (
        <div className="absolute bottom-3 right-3 z-30 w-72">
          <ShowcaseLead token={shareToken} premiseNumber={doc.buildings.flatMap((b) => b.floors).find((f) => f.id === selection.floorId)?.premiseLinks[selection.id ?? ""]} onClose={() => useEditorStore.getState().setSelection({ type: "none" })} />
        </div>
      )}
      {box && (
        // рамка выделения: синяя сплошная — «целиком внутри», зелёная пунктирная — «задетые»
        <div
          className="pointer-events-none absolute z-30"
          style={{
            left: Math.min(box.x1, box.x2),
            top: Math.min(box.y1, box.y2),
            width: Math.abs(box.x2 - box.x1),
            height: Math.abs(box.y2 - box.y1),
            border: box.x2 < box.x1 ? "1.5px dashed #22c55e" : "1.5px solid #38bdf8",
            background: box.x2 < box.x1 ? "rgba(34,197,94,0.08)" : "rgba(56,189,248,0.08)",
          }}
        />
      )}
      {!readOnly && multi.length > 0 && (
        <div
          className="absolute left-1/2 top-[9.75rem] z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl px-4 py-2 text-sm font-semibold shadow-xl backdrop-blur-xl"
          style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.accent}`, color: TOKENS.text }}
        >
          <span style={{ color: TOKENS.accent }}>Выбрано: {multi.length}</span>
          {multi.some((id) => wallFloor(doc, id)) && <WallGroupBar />}
          {multi.length >= 2 && multi.every((id) => objTarget(doc, id)) && (
            <>
              <button
                type="button"
                onClick={() => groupAlign(useEditorStore.getState().multi, "x")}
                className="rounded-md px-2 py-1 text-xs"
                style={{ background: TOKENS.panelBorder, color: TOKENS.text }}
              >
                Выровнять X
              </button>
              <button
                type="button"
                onClick={() => groupAlign(useEditorStore.getState().multi, "z")}
                className="rounded-md px-2 py-1 text-xs"
                style={{ background: TOKENS.panelBorder, color: TOKENS.text }}
              >
                Выровнять Z
              </button>
            </>
          )}
          {multi.every((id) => objTarget(doc, id)) && <button
            type="button"
            onClick={() => groupDuplicate(useEditorStore.getState().multi)}
            className="rounded-md px-2 py-1 text-xs"
            style={{ background: TOKENS.panelBorder, color: TOKENS.text }}
          >
            Дублировать (Ctrl+D)
          </button>}
          <button
            type="button"
            onClick={() => groupDelete(useEditorStore.getState().multi)}
            className="rounded-md px-2 py-1 text-xs"
            style={{ background: "rgba(239,68,68,0.18)", color: "#fca5a5" }}
          >
            Удалить (Del)
          </button>
          <button
            type="button"
            onClick={() => useEditorStore.getState().clearMulti()}
            className="rounded-md px-2 py-1 text-xs"
            style={{ background: TOKENS.panelBorder, color: TOKENS.muted }}
          >
            Сбросить (Esc)
          </button>
        </div>
      )}
      {!readOnly && <StatusBar />}
      {readOnly && (
        <div
          className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-xl backdrop-blur-xl"
          style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.text }}
        >
          <span style={{ color: TOKENS.accent }}>●</span> {showcaseName ?? "Витрина"} · Commrent
        </div>
      )}
      {hud && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 translate-y-10 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-xl backdrop-blur"
          style={{ background: "rgba(15,23,42,0.92)", border: `1px solid ${TOKENS.accent}`, color: TOKENS.accent }}
        >
          {hud}
        </div>
      )}
      {!ready && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 transition-opacity duration-500"
          style={{ background: "radial-gradient(circle at 50% 40%, #0e1830, #070A12)" }}
        >
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: TOKENS.accent, boxShadow: `0 0 40px ${TOKENS.accent}` }}>
              <span className="text-xl font-black text-slate-900">C</span>
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">Commrent Building Studio</div>
              <div className="text-xs" style={{ color: TOKENS.muted }}>Загружаем 3D-сцену…</div>
            </div>
          </div>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: TOKENS.accent }} />
        </div>
      )}
    </div>
  )
}
