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
  | "delete"

export type CameraMode = "orbit" | "top" | "plan" | "walk"
export type DisplayMode = "all" | "active" | "cutaway" | "ghost"

export type SelectionType = "none" | "wall" | "node" | "room" | "object" | "floor" | "opening" | "stair"
export interface Selection {
  type: SelectionType
  id?: string
  floorId?: string
}

export type OpeningType = "door" | "window"
export type StairShape = "straight" | "l" | "u" | "spiral"
export type TerrainMode = "raise" | "lower" | "flatten" | "smooth"

export interface EditorState {
  activeTool: Tool
  cameraMode: CameraMode
  displayMode: DisplayMode
  wallsDown: boolean
  activeLevelId: string // floorId или "site"
  selection: Selection
  hoverId: string | null
  paintMaterialId: string
  openingType: OpeningType
  openingVariant: string
  stairShape: StairShape
  terrainMode: TerrainMode
  armedAsset: string | null
  setTool: (t: Tool) => void
  setCameraMode: (m: CameraMode) => void
  setDisplayMode: (m: DisplayMode) => void
  toggleWallsDown: () => void
  setActiveLevel: (id: string) => void
  setSelection: (s: Selection) => void
  setHover: (id: string | null) => void
  setPaintMaterial: (id: string) => void
  setOpeningType: (t: OpeningType) => void
  setOpeningVariant: (v: string) => void
  setStairShape: (s: StairShape) => void
  setTerrainMode: (m: TerrainMode) => void
  armAsset: (id: string | null) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  activeTool: "select",
  cameraMode: "orbit",
  displayMode: "all",
  wallsDown: false,
  activeLevelId: "",
  selection: { type: "none" },
  hoverId: null,
  paintMaterialId: "brick",
  openingType: "door",
  openingVariant: "interior",
  stairShape: "u",
  terrainMode: "raise",
  armedAsset: null,
  setTool: (t) => set((s) => ({
    activeTool: t,
    selection: { type: "none" },
    armedAsset: t === "object" ? s.armedAsset : null,
    openingVariant: t === "door" ? "interior" : t === "window" ? "standard" : s.openingVariant,
  })),
  setCameraMode: (m) => set({ cameraMode: m }),
  setDisplayMode: (m) => set({ displayMode: m }),
  toggleWallsDown: () => set((s) => ({ wallsDown: !s.wallsDown })),
  setActiveLevel: (id) => set({ activeLevelId: id, selection: { type: "none" } }),
  setSelection: (s) => set({ selection: s }),
  setHover: (id) => set({ hoverId: id }),
  setPaintMaterial: (id) => set({ paintMaterialId: id }),
  setOpeningType: (t) => set({ openingType: t }),
  setOpeningVariant: (v) => set({ openingVariant: v }),
  setStairShape: (s) => set({ stairShape: s }),
  setTerrainMode: (m) => set({ terrainMode: m }),
  armAsset: (id) => set({ armedAsset: id }),
}))
