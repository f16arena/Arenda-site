// ADR: Раздельные сторы (§6.1). documentStore — документ + стек команд (мутации
// ТОЛЬКО через execute(command)). editorStore — UI-состояние редактора (инструмент,
// выбор, активный уровень, режим камеры/отображения). `rev` инкрементится при каждой
// мутации документа — движок подписан на него и инкрементально перестраивает сцену.

import { create } from "zustand"
import type { BuilderDocument } from "@/types/builder"
import { type Command, CommandStack } from "@/core/document/commands"
import { buildDemoProject } from "@/lib/builder/demo-project"

export interface DocumentState {
  doc: BuilderDocument
  rev: number
  canUndo: boolean
  canRedo: boolean
  execute: (cmd: Command) => void
  undo: () => void
  redo: () => void
  loadDocument: (doc: BuilderDocument) => void
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  const stack = new CommandStack(
    () => get().doc,
    (d) => set({ doc: d, rev: get().rev + 1 }),
  )
  const sync = () => set({ canUndo: stack.canUndo(), canRedo: stack.canRedo() })
  return {
    doc: buildDemoProject(),
    rev: 0,
    canUndo: false,
    canRedo: false,
    execute: (cmd) => {
      stack.execute(cmd)
      sync()
    },
    undo: () => {
      stack.undo()
      sync()
    },
    redo: () => {
      stack.redo()
      sync()
    },
    loadDocument: (doc) => {
      stack.clear()
      set({ doc, rev: get().rev + 1, canUndo: false, canRedo: false })
    },
  }
})

export type SyncStatus = "idle" | "saving" | "saved" | "conflict" | "error"

export interface SyncState {
  projectId: string | null
  name: string
  revision: number
  status: SyncStatus
  lastSavedRev: number
  setProject: (id: string | null, name: string, revision: number) => void
  setName: (name: string) => void
  setRevision: (revision: number) => void
  setStatus: (status: SyncStatus) => void
  setLastSavedRev: (rev: number) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  projectId: null,
  name: "Demo Building",
  revision: 0,
  status: "idle",
  lastSavedRev: -1,
  setProject: (projectId, name, revision) => set({ projectId, name, revision, status: "saved", lastSavedRev: revision }),
  setName: (name) => set({ name }),
  setRevision: (revision) => set({ revision }),
  setStatus: (status) => set({ status }),
  setLastSavedRev: (lastSavedRev) => set({ lastSavedRev }),
}))

export type Tool =
  | "select"
  | "wall"
  | "room"
  | "floor"
  | "door"
  | "window"
  | "stair"
  | "roof"
  | "terrain"
  | "road"
  | "parking"
  | "fence"
  | "tree"
  | "object"
  | "material"
  | "link"
  | "water"
  | "pave"
  | "delete"

export type CameraMode = "orbit" | "top" | "plan" | "walk"
export type DisplayMode = "all" | "active" | "cutaway" | "ghost"

export type SelectionType = "none" | "wall" | "node" | "room" | "object" | "floor" | "opening" | "stair" | "water" | "path" | "pavement"
export interface Selection {
  type: SelectionType
  id?: string
  floorId?: string
}

export type OpeningType = "door" | "window"
export type StairShape = "straight" | "l" | "u" | "spiral"
export type TerrainMode = "raise" | "lower" | "flatten" | "smooth" | "terrace"
export type PathKind = "road" | "path"
export type FenceStyle = "profnastil" | "shtaketnik" | "mesh" | "forged" | "wood"
export type BuildMode = "build" | "buy" | "material" | "terrain" | "water" | "landscape"
export type GizmoMode = "none" | "move" | "rotate"

export interface EditorState {
  activeTool: Tool
  mode: BuildMode
  cameraMode: CameraMode
  displayMode: DisplayMode
  wallsDown: boolean
  activeLevelId: string // floorId или "site"
  selection: Selection
  multi: string[]
  hoverId: string | null
  paintMaterialId: string
  openingType: OpeningType
  openingVariant: string
  stairShape: StairShape
  terrainMode: TerrainMode
  waterDepth: number
  pathKind: PathKind
  pathWidth: number
  fenceStyle: FenceStyle
  paveMaterial: string
  assetBaseSizes: Record<string, { w: number; d: number; h: number }>
  armedAsset: string | null
  gizmoMode: GizmoMode
  turbo: boolean
  setTool: (t: Tool) => void
  setMode: (m: BuildMode) => void
  setCameraMode: (m: CameraMode) => void
  setDisplayMode: (m: DisplayMode) => void
  toggleWallsDown: () => void
  setActiveLevel: (id: string) => void
  setSelection: (s: Selection) => void
  toggleMulti: (id: string) => void
  clearMulti: () => void
  setHover: (id: string | null) => void
  setPaintMaterial: (id: string) => void
  setOpeningType: (t: OpeningType) => void
  setOpeningVariant: (v: string) => void
  setStairShape: (s: StairShape) => void
  setTerrainMode: (m: TerrainMode) => void
  setWaterDepth: (mm: number) => void
  setPathKind: (k: PathKind) => void
  setPathWidth: (mm: number) => void
  setFenceStyle: (s: FenceStyle) => void
  setPaveMaterial: (id: string) => void
  setAssetBaseSizes: (r: Record<string, { w: number; d: number; h: number }>) => void
  armAsset: (id: string | null) => void
  setGizmoMode: (m: GizmoMode) => void
  setTurbo: (on: boolean) => void
}

const MODE_DEFAULT_TOOL: Record<BuildMode, Tool> = {
  build: "wall",
  buy: "object",
  material: "material",
  terrain: "terrain",
  water: "water",
  landscape: "object",
}

export const useEditorStore = create<EditorState>((set) => ({
  activeTool: "select",
  mode: "build",
  cameraMode: "orbit",
  displayMode: "all",
  wallsDown: false,
  activeLevelId: "",
  selection: { type: "none" },
  multi: [],
  hoverId: null,
  paintMaterialId: "brick",
  openingType: "door",
  openingVariant: "interior",
  stairShape: "u",
  terrainMode: "raise",
  waterDepth: 800,
  pathKind: "road",
  pathWidth: 3000,
  fenceStyle: "profnastil",
  paveMaterial: "asphalt",
  assetBaseSizes: {},
  armedAsset: null,
  gizmoMode: "move",
  turbo: false,
  setTool: (t) => set((s) => ({
    activeTool: t,
    selection: { type: "none" },
    armedAsset: t === "object" ? s.armedAsset : null,
    openingVariant: t === "door" ? "interior" : t === "window" ? "standard" : s.openingVariant,
  })),
  setMode: (m) => set((s) => ({
    mode: m,
    activeTool: MODE_DEFAULT_TOOL[m],
    selection: { type: "none" },
    armedAsset: MODE_DEFAULT_TOOL[m] === "object" ? s.armedAsset : null,
  })),
  setCameraMode: (m) => set({ cameraMode: m }),
  setDisplayMode: (m) => set({ displayMode: m }),
  toggleWallsDown: () => set((s) => ({ wallsDown: !s.wallsDown })),
  setActiveLevel: (id) => set({ activeLevelId: id, selection: { type: "none" } }),
  setSelection: (s) => set({ selection: s, multi: [] }),
  toggleMulti: (id) => set((st) => ({ multi: st.multi.includes(id) ? st.multi.filter((m) => m !== id) : [...st.multi, id], selection: { type: "none" } })),
  clearMulti: () => set({ multi: [] }),
  setHover: (id) => set({ hoverId: id }),
  setPaintMaterial: (id) => set({ paintMaterialId: id }),
  setOpeningType: (t) => set({ openingType: t }),
  setOpeningVariant: (v) => set({ openingVariant: v }),
  setStairShape: (s) => set({ stairShape: s }),
  setTerrainMode: (m) => set({ terrainMode: m }),
  setWaterDepth: (mm) => set({ waterDepth: mm }),
  setPathKind: (k) => set({ pathKind: k }),
  setPathWidth: (mm) => set({ pathWidth: mm }),
  setFenceStyle: (s) => set({ fenceStyle: s }),
  setPaveMaterial: (id) => set({ paveMaterial: id }),
  setAssetBaseSizes: (r) => set({ assetBaseSizes: r }),
  armAsset: (id) => set({ armedAsset: id }),
  setGizmoMode: (m) => set({ gizmoMode: m }),
  setTurbo: (on) => set({ turbo: on }),
}))
