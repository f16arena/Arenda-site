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
  /** автомебель и светильники в 3D (в документ не пишутся) */
  showFurniture: boolean
  /** час суток для солнца в 3D, 5–21 */
  hourOfDay: number
  cursorMm: { x: number; y: number } | null
  setLabels: (labels: ScreenLabel[]) => void
  toggleDimensions: () => void
  toggleTenants: () => void
  toggleFurniture: () => void
  setHourOfDay: (h: number) => void
  setCursor: (mm: { x: number; y: number } | null) => void
}

/**
 * Настройки вида живут между сессиями: выключил мебель или поставил вечер —
 * после перезагрузки так и осталось. В приватном режиме localStorage может
 * бросать, поэтому всё в try/catch.
 */
const VIEW_KEY = "builder:view"
type ViewPrefs = { showDimensions: boolean; showTenants: boolean; showFurniture: boolean; hourOfDay: number }
const DEFAULT_PREFS: ViewPrefs = { showDimensions: false, showTenants: true, showFurniture: true, hourOfDay: 13 }

function readPrefs(): ViewPrefs {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_PREFS
    const raw = localStorage.getItem(VIEW_KEY)
    if (!raw) return DEFAULT_PREFS
    const v = JSON.parse(raw) as Partial<ViewPrefs>
    return {
      showDimensions: typeof v.showDimensions === "boolean" ? v.showDimensions : DEFAULT_PREFS.showDimensions,
      showTenants: typeof v.showTenants === "boolean" ? v.showTenants : DEFAULT_PREFS.showTenants,
      showFurniture: typeof v.showFurniture === "boolean" ? v.showFurniture : DEFAULT_PREFS.showFurniture,
      hourOfDay: typeof v.hourOfDay === "number" && v.hourOfDay >= 5 && v.hourOfDay <= 21 ? v.hourOfDay : DEFAULT_PREFS.hourOfDay,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(p: ViewPrefs): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(VIEW_KEY, JSON.stringify(p))
  } catch {
    /* приватный режим — просто не запоминаем */
  }
}

/** Текущие настройки вида из состояния — чтобы сохранять их целиком. */
function pick(s: LabelState): ViewPrefs {
  return { showDimensions: s.showDimensions, showTenants: s.showTenants, showFurniture: s.showFurniture, hourOfDay: s.hourOfDay }
}

const prefs = readPrefs()

export const useLabelStore = create<LabelState>((set, get) => ({
  labels: [],
  // размеры всех стен по умолчанию выключены: в 3D они закрывали вид;
  // у выбранной стены размер виден всегда, остальные — кнопкой «Размеры» (L)
  showDimensions: prefs.showDimensions,
  showTenants: prefs.showTenants,
  showFurniture: prefs.showFurniture,
  hourOfDay: prefs.hourOfDay,
  cursorMm: null,
  setLabels: (labels) => set({ labels }),
  toggleDimensions: () => set((s) => {
    const next = !s.showDimensions
    savePrefs({ ...pick(get()), showDimensions: next })
    return { showDimensions: next }
  }),
  toggleTenants: () => set((s) => {
    const next = !s.showTenants
    savePrefs({ ...pick(get()), showTenants: next })
    return { showTenants: next }
  }),
  toggleFurniture: () => set((s) => {
    const next = !s.showFurniture
    savePrefs({ ...pick(get()), showFurniture: next })
    return { showFurniture: next }
  }),
  setHourOfDay: (h) => {
    savePrefs({ ...pick(get()), hourOfDay: h })
    set({ hourOfDay: h })
  },
  setCursor: (cursorMm) => set({ cursorMm }),
}))
