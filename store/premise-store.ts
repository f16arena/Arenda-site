// Помещения здания для конструктора: статус, арендатор, площадь по договору.
//
// Ключ — id карточки Space: именно его кладёт в premiseLinks сборка из данных.
// По номеру ищем только ради старых моделей, где привязка вводилась вручную
// номером через prompt.

import { create } from "zustand"
import type { PremiseStatus } from "@/lib/builder/materials"

export type BuildingPremise = {
  id: string
  number: string
  floorNumber: number
  status: PremiseStatus
  tenantName: string | null
  areaM2: number | null
  debt: number
}

interface PremiseState {
  byId: Map<string, BuildingPremise>
  byNumber: Map<string, BuildingPremise>
  loaded: boolean
  setRows: (rows: BuildingPremise[]) => void
  /** найти по id, а если не нашлось — по номеру (наследие ручной привязки) */
  resolve: (key: string) => BuildingPremise | undefined
}

export const usePremiseStore = create<PremiseState>((set, get) => ({
  byId: new Map(),
  byNumber: new Map(),
  loaded: false,
  setRows: (rows) =>
    set({
      byId: new Map(rows.map((row) => [row.id, row])),
      byNumber: new Map(rows.map((row) => [row.number, row])),
      loaded: true,
    }),
  resolve: (key) => get().byId.get(key) ?? get().byNumber.get(key),
}))
