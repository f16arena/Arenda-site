// Зачем сейчас работает рулетка: просто измерить, откалибровать подложку или
// сдвинуть её по двум точкам. Движок отдаёт отрезок, а что с ним делать,
// решает BuilderApp по этому намерению.

import { create } from "zustand"

export type UnderlayIntent = "calibrate" | "move" | null

interface UnderlayIntentState {
  intent: UnderlayIntent
  setIntent: (intent: UnderlayIntent) => void
}

export const useUnderlayIntent = create<UnderlayIntentState>((set) => ({
  intent: null,
  setIntent: (intent) => set({ intent }),
}))
