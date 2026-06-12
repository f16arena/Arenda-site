"use client"

// ADR: Оркестратор редактора. Раскладка (тулбар/уровни/свойства/каталог/камера/статус),
// загрузочный экран, хоткеи и двусторонняя связка стора с движком. Канвас грузится
// динамически (ssr:false). Свежие данные движок берёт через getState — без устаревших
// замыканий и лишних пересозданий колбэков.

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import { useDocumentStore, useEditorStore, type Tool, type CameraMode } from "@/store/builder-store"
import type { BuilderEngine, MeshMeta } from "@/engine/engine"
import { DeleteObjectCommand, DeleteWallCommand } from "@/core/document/commands"
import { DEMO_PREMISE_STATUS } from "@/lib/builder/demo-project"
import { TOKENS } from "@/lib/builder/materials"
import { BuilderToolbar } from "./BuilderToolbar"
import { LevelPanel } from "./LevelPanel"
import { PropertyPanel } from "./PropertyPanel"
import { AssetCatalog } from "./AssetCatalog"
import { CameraControls } from "./CameraControls"
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
  else if (meta.kind === "object") setSelection({ type: "object", id: meta.entityId, floorId: meta.target !== "site" ? meta.target : undefined })
  else setSelection({ type: "none" })
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

export function BuilderApp() {
  const engineRef = useRef<BuilderEngine | null>(null)
  const [ready, setReady] = useState(false)

  const doc = useDocumentStore((s) => s.doc)
  const rev = useDocumentStore((s) => s.rev)
  const activeTool = useEditorStore((s) => s.activeTool)
  const cameraMode = useEditorStore((s) => s.cameraMode)
  const displayMode = useEditorStore((s) => s.displayMode)
  const wallsDown = useEditorStore((s) => s.wallsDown)
  const activeLevelId = useEditorStore((s) => s.activeLevelId)
  const selection = useEditorStore((s) => s.selection)

  const handleReady = useCallback((engine: BuilderEngine) => {
    engineRef.current = engine
    engine.statusResolver = (pid) => DEMO_PREMISE_STATUS[pid]
    engine.getDoc = () => useDocumentStore.getState().doc
    engine.onCommand = (cmd) => useDocumentStore.getState().execute(cmd)
    engine.onPick = (meta) => applyPick(meta)
    const d = useDocumentStore.getState().doc
    const first = d.buildings[0]?.floors?.[0]
    if (first) useEditorStore.getState().setActiveLevel(first.id)
    setReady(true)
  }, [])

  // Пересборка сцены при изменении документа/уровня/режима отображения.
  useEffect(() => {
    const e = engineRef.current
    if (!e || !ready) return
    e.activeFloorId = activeLevelId
    e.statusResolver = (pid) => DEMO_PREMISE_STATUS[pid]
    e.rebuild(doc, { activeLevelId, displayMode, wallsDown })
    e.setSelection(useEditorStore.getState().selection)
  }, [ready, rev, activeLevelId, displayMode, wallsDown, doc])

  useEffect(() => {
    const e = engineRef.current
    if (e && ready) e.setSelection(selection)
  }, [selection, ready])

  useEffect(() => {
    const e = engineRef.current
    if (!e || !ready) return
    e.tool = activeTool
    if (activeTool !== "wall") e.cancelWallTool()
  }, [activeTool, ready])

  useEffect(() => {
    const e = engineRef.current
    if (e && ready) e.setCameraMode(cameraMode)
  }, [cameraMode, ready])

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
        deleteSelection()
        return
      }
      if (e.key === "Escape") {
        engineRef.current?.cancelWallTool()
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
    <div className="fixed inset-0 overflow-hidden" style={{ background: TOKENS.background, color: TOKENS.text }}>
      <BuilderCanvas onReady={handleReady} />
      <BuilderToolbar />
      <LevelPanel />
      <PropertyPanel />
      <CameraControls />
      <AssetCatalog />
      <StatusBar />
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
