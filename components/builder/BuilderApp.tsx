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
import { AddObjectCommand, DeleteObjectCommand, DeleteWallCommand, LinkPremiseCommand } from "@/core/document/commands"
import { uid } from "@/core/id"
import { listOrgPremises } from "@/app/actions/builder-premise"
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
import { CameraControls } from "./CameraControls"
import { ViewCube } from "./ViewCube"
import { MiniMap } from "./MiniMap"
import { ShowcaseLead } from "./ShowcaseLead"
import { StatusBar } from "./StatusBar"

const BuilderCanvas = dynamic(() => import("./BuilderCanvas").then((m) => m.BuilderCanvas), { ssr: false })

function applyPick(meta: MeshMeta | null): void {
  const setSelection = useEditorStore.getState().setSelection
  if (!meta || !meta.entityId) {
    setSelection({ type: "none" })
    return
  }
  if (meta.kind === "wall") setSelection({ type: "wall", id: meta.entityId, floorId: meta.floorId })
  else if (meta.kind === "room") setSelection({ type: "room", id: meta.entityId, floorId: meta.floorId })
  else if (meta.kind === "opening") setSelection({ type: "opening", id: meta.entityId, floorId: meta.floorId })
  else if (meta.kind === "stair") setSelection({ type: "stair", id: meta.entityId, floorId: meta.floorId })
  else if (meta.kind === "object") setSelection({ type: "object", id: meta.entityId, floorId: meta.target !== "site" ? meta.target : undefined })
  else setSelection({ type: "none" })
}

function objTarget(doc: BuilderDocument, id: string): { target: { site: true } | { floorId: string }; obj: import("@/types/builder").BuilderObject } | null {
  const inSite = doc.site.objects.find((o) => o.id === id)
  if (inSite) return { target: { site: true }, obj: inSite }
  for (const b of doc.buildings) for (const f of b.floors) {
    const o = f.objects.find((ob) => ob.id === id)
    if (o) return { target: { floorId: f.id }, obj: o }
  }
  return null
}

function groupDelete(ids: string[]): void {
  const exec = useDocumentStore.getState().execute
  const d = useDocumentStore.getState().doc
  for (const id of ids) {
    const t = objTarget(d, id)
    if (t) exec(new DeleteObjectCommand(t.target, id))
  }
  useEditorStore.getState().clearMulti()
}

function groupDuplicate(ids: string[]): void {
  const exec = useDocumentStore.getState().execute
  const d = useDocumentStore.getState().doc
  for (const id of ids) {
    const t = objTarget(d, id)
    if (t) exec(new AddObjectCommand(t.target, { ...t.obj, id: uid("o"), position: { ...t.obj.position, x: t.obj.position.x + 800, z: t.obj.position.z + 800 } }))
  }
}

function deleteSelection(): void {
  const sel = useEditorStore.getState().selection
  const exec = useDocumentStore.getState().execute
  const d = useDocumentStore.getState().doc
  if (sel.type === "wall" && sel.floorId && sel.id) exec(new DeleteWallCommand(sel.floorId, sel.id))
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
const CAM_KEYS: Record<string, CameraMode> = { "1": "orbit", "2": "top", "3": "plan", "4": "walk" }

export function BuilderApp({ initialProjectId, initialDoc, readOnly, showcaseName, shareToken }: { initialProjectId?: string; initialDoc?: BuilderDocument; readOnly?: boolean; showcaseName?: string; shareToken?: string }) {
  const engineRef = useRef<BuilderEngine | null>(null)
  const [ready, setReady] = useState(false)
  const premiseMapRef = useRef<Map<string, PremiseStatus>>(new Map())
  const [premiseReady, setPremiseReady] = useState(0)

  const [hud, setHud] = useState<string | null>(null)
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
  const armedAsset = useEditorStore((s) => s.armedAsset)
  const openingVariant = useEditorStore((s) => s.openingVariant)
  const mode = useEditorStore((s) => s.mode)
  const gizmoMode = useEditorStore((s) => s.gizmoMode)

  const handleReady = useCallback((engine: BuilderEngine) => {
    engineRef.current = engine
    engine.statusResolver = (pid) => premiseMapRef.current.get(pid) ?? DEMO_PREMISE_STATUS[pid]
    engine.getDoc = () => useDocumentStore.getState().doc
    engine.onCommand = readOnly ? () => {} : (cmd) => useDocumentStore.getState().execute(cmd)
    engine.onPick = (meta) => applyPick(meta)
    engine.onMultiToggle = (id) => useEditorStore.getState().toggleMulti(id)
    engine.onLinkRoom = (floorId, roomId) => {
      const num = window.prompt("Номер помещения Commrent (привязать к комнате):")
      if (num && num.trim()) useDocumentStore.getState().execute(new LinkPremiseCommand(floorId, roomId, num.trim()))
    }
    engine.onHud = (t) => setHud(t)
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
  }, [readOnly, initialDoc])

  // Пересборка сцены при изменении документа/уровня/режима отображения.
  useEffect(() => {
    const e = engineRef.current
    if (!e || !ready) return
    e.activeFloorId = activeLevelId
    e.statusResolver = (pid) => DEMO_PREMISE_STATUS[pid]
    e.rebuild(doc, { activeLevelId, displayMode, wallsDown })
    e.setSelection(useEditorStore.getState().selection)
  }, [ready, rev, activeLevelId, displayMode, wallsDown, doc, premiseReady])

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
    if (!e || !ready) return
    e.tool = activeTool
    e.paintMaterialId = paintMaterialId
    e.stairShape = stairShape
    e.terrainMode = terrainMode
    e.openingType = activeTool === "window" ? "window" : "door"
    e.openingVariant = openingVariant
    e.setArmedAsset(activeTool === "object" ? armedAsset : null)
    if (activeTool !== "wall") e.cancelWallTool()
  }, [activeTool, paintMaterialId, stairShape, terrainMode, armedAsset, openingVariant, ready])

  useEffect(() => {
    const e = engineRef.current
    if (e && ready) e.setCameraMode(cameraMode)
  }, [cameraMode, ready])

  // Реальные статусы помещений организации (для overlay) — только в редакторе.
  useEffect(() => {
    if (readOnly) return
    let cancelled = false
    void listOrgPremises()
      .then((rows) => {
        if (cancelled) return
        const m = new Map<string, PremiseStatus>()
        for (const r of rows) m.set(r.number, r.status)
        premiseMapRef.current = m
        setPremiseReady((n) => n + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [readOnly])

  // Загрузка сохранённого проекта по ?project (иначе остаётся demo).
  useEffect(() => {
    if (!ready || !initialProjectId) return
    let cancelled = false
    void loadBuilderProject(initialProjectId)
      .then((p) => {
        if (cancelled || !p) return
        useDocumentStore.getState().loadDocument(p.doc)
        useSyncStore.getState().setProject(p.id, p.name, p.revision)
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
      if (eng && eng.isDrawingWall() && (/^[0-9]$/.test(e.key) || e.key === "Backspace" || e.key === "Enter" || e.key === ",")) {
        e.preventDefault()
        eng.handleLengthKey(e.key)
        return
      }
      // R — поворот объекта в режиме размещения
      if ((e.key === "r" || e.key === "R") && ed.activeTool === "object" && ed.armedAsset) {
        engineRef.current?.rotatePlacer(45)
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
        engineRef.current?.cancelWallTool()
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
      {!readOnly && <ModeSwitcher />}
      {!readOnly && <BuilderToolbar />}
      {!readOnly && <BuilderProjectBar />}
      {!readOnly && <ToolOptions />}
      {!readOnly && <LevelPanel />}
      <PropertyPanel />
      <CameraControls />
      <ViewCube onView={(a, b) => engineRef.current?.orbitTo(a, b)} />
      {!readOnly && <AssetCatalog key={mode} />}
      {!readOnly && <MiniMap />}
      {readOnly && selection.type === "room" && selection.floorId && (
        <div className="absolute bottom-3 right-3 z-30 w-72">
          <ShowcaseLead token={shareToken} premiseNumber={doc.buildings.flatMap((b) => b.floors).find((f) => f.id === selection.floorId)?.premiseLinks[selection.id ?? ""]} onClose={() => useEditorStore.getState().setSelection({ type: "none" })} />
        </div>
      )}
      {!readOnly && multi.length > 0 && (
        <div
          className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2 text-sm font-semibold shadow-xl backdrop-blur-xl"
          style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.accent}`, color: TOKENS.text }}
        >
          <span style={{ color: TOKENS.accent }}>Выбрано: {multi.length}</span>
          <button
            type="button"
            onClick={() => groupDuplicate(useEditorStore.getState().multi)}
            className="rounded-md px-2 py-1 text-xs"
            style={{ background: TOKENS.panelBorder, color: TOKENS.text }}
          >
            Дублировать (Ctrl+D)
          </button>
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
