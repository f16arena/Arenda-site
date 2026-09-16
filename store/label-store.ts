// Экранные подписи сцены: размеры стен и имена помещений.
//
// Движок каждый кадр проецирует якоря активного этажа в пиксели и кладёт сюда;
// React-слой поверх холста рисует их обычными div — текст остаётся резким на
// любом зуме и живёт по шрифту продукта. Никакой GUI-библиотеки не нужно.

import { create } from "zustand"

export type ScreenLabel =
  | { kind: "wall"; id: string; x: number; y: number; lengthMm: number; angleDeg: number }
  | { kind: "room"; id: string; floorId: string; x: number; y: number; areaMm2: number }

interface LabelState {
  labels: ScreenLabel[]
  showDimensions: boolean
  cursorMm: { x: number; y: number } | null
  setLabels: (labels: ScreenLabel[]) => void
  toggleDimensions: () => void
  setCursor: (mm: { x: number; y: number } | null) => void
}

export const useLabelStore = create<LabelState>((set) => ({
  labels: [],
  showDimensions: true,
  cursorMm: null,
  setLabels: (labels) => set({ labels }),
  toggleDimensions: () => set((s) => ({ showDimensions: !s.showDimensions })),
  setCursor: (cursorMm) => set({ cursorMm }),
}))
