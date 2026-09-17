// Экранные подписи сцены: размеры стен и имена помещений.
//
// Движок каждый кадр проецирует якоря активного этажа в пиксели и кладёт сюда;
// React-слой поверх холста рисует их обычными div — текст остаётся резким на
// любом зуме и живёт по шрифту продукта. Никакой GUI-библиотеки не нужно.

import { create } from "zustand"

export type ScreenLabel =
  | { kind: "wall"; id: string; x: number; y: number; lengthMm: number; angleDeg: number }
  | { kind: "room"; id: string; floorId: string; x: number; y: number; areaMm2: number }
  | { kind: "note"; id: string; x: number; y: number; text: string; dim: boolean; angleDeg: number }

interface LabelState {
  labels: ScreenLabel[]
  showDimensions: boolean
  /** показывать арендаторов: подписи с именем арендатора и подсветку по статусу */
  showTenants: boolean
  cursorMm: { x: number; y: number } | null
  setLabels: (labels: ScreenLabel[]) => void
  toggleDimensions: () => void
  toggleTenants: () => void
  setCursor: (mm: { x: number; y: number } | null) => void
}

export const useLabelStore = create<LabelState>((set) => ({
  labels: [],
  // размеры всех стен по умолчанию выключены: в 3D они закрывали вид;
  // у выбранной стены размер виден всегда, остальные — кнопкой «Размеры» (L)
  showDimensions: false,
  showTenants: true,
  cursorMm: null,
  setLabels: (labels) => set({ labels }),
  toggleDimensions: () => set((s) => ({ showDimensions: !s.showDimensions })),
  toggleTenants: () => set((s) => ({ showTenants: !s.showTenants })),
  setCursor: (cursorMm) => set({ cursorMm }),
}))
