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

export type SelectionType = "none" | "wall" | "node" | "room" | "object" | "floor"
export interface Selection {
  type: SelectionType
  id?: string
  floorId?: string
}

export type OpeningType = "door" | "window"
export type StairShape = "straight" | "l" | "u" | "spiral"

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
  stairShape: StairShape
  setTool: (t: Tool) => void
  setCameraMode: (m: CameraMode) => void
  setDisplayMode: (m: DisplayMode) => void
  toggleWallsDown: () => void
  setActiveLevel: (id: string) => void
  setSelection: (s: Selection) => void
  setHover: (id: string | null) => void
  setPaintMaterial: (id: string) => void
  setOpeningType: (t: OpeningType) => void
  setStairShape: (s: StairShape) => void
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
  stairShape: "u",
  setTool: (t) => set({ activeTool: t, selection: { type: "none" } }),
  setCameraMode: (m) => set({ cameraMode: m }),
  setDisplayMode: (m) => set({ displayMode: m }),
  toggleWallsDown: () => set((s) => ({ wallsDown: !s.wallsDown })),
  setActiveLevel: (id) => set({ activeLevelId: id, selection: { type: "none" } }),
  setSelection: (s) => set({ selection: s }),
  setHover: (id) => set({ hoverId: id }),
  setPaintMaterial: (id) => set({ paintMaterialId: id }),
  setOpeningType: (t) => set({ openingType: t }),
  setStairShape: (s) => set({ stairShape: s }),
}))
