// Типы договоров по предмету аренды (помещение / крыша / территория / …).
// Базовые типы показываются всегда; расширенные — только если у организации есть
// объекты такого вида или загружен шаблон под этот тип (см. availableContractTypesForOrg
// в lib/contract-types-availability.ts). Чистый модуль — можно импортировать и на клиенте.

export type ContractPlacementType =
  | "PREMISES"
  | "ROOF"
  | "TERRITORY"
  | "WAREHOUSE"
  | "ADVERTISING"
  | "EQUIPMENT"
  | "PARKING"

export interface ContractTypeDef {
  key: ContractPlacementType
  /** Полное название для договора/меню. */
  label: string
  /** Короткая метка (для списков/бейджей). */
  short: string
  /** Базовый тип — кандидат на показ всегда (если есть помещения). */
  core: boolean
  description: string
}

export const CONTRACT_PLACEMENT_TYPES: ContractTypeDef[] = [
  { key: "PREMISES", label: "Аренда помещения", short: "Помещение", core: true,
    description: "Помещение на этаже здания (расчёт: площадь × ставка)." },
  { key: "ROOF", label: "Аренда места на крыше/фасаде", short: "Крыша/фасад", core: true,
    description: "Антенно-мачтовые сооружения, оборудование, реклама на крыше/фасаде (фикс-сумма)." },
  { key: "TERRITORY", label: "Аренда места на территории", short: "Территория", core: true,
    description: "Двор, парковка, открытые площадки, веранды (фикс-сумма)." },
  { key: "WAREHOUSE", label: "Аренда склада", short: "Склад", core: false,
    description: "Складское помещение." },
  { key: "ADVERTISING", label: "Размещение рекламной конструкции", short: "Реклама/щит", core: false,
    description: "Рекламные конструкции, билборды, баннеры." },
  { key: "EQUIPMENT", label: "Аренда оборудования", short: "Оборудование", core: false,
    description: "Оборудование/техника." },
  { key: "PARKING", label: "Аренда парковочного места", short: "Парковка", core: false,
    description: "Парковочное место." },
]

const BY_KEY = new Map(CONTRACT_PLACEMENT_TYPES.map((t) => [t.key, t]))

export const CORE_CONTRACT_TYPES: ContractPlacementType[] =
  CONTRACT_PLACEMENT_TYPES.filter((t) => t.core).map((t) => t.key)

export function isContractPlacementType(v: unknown): v is ContractPlacementType {
  return typeof v === "string" && BY_KEY.has(v as ContractPlacementType)
}

export function contractTypeDef(key: string | null | undefined): ContractTypeDef | null {
  return key ? BY_KEY.get(key as ContractPlacementType) ?? null : null
}

export function contractTypeShort(key: string | null | undefined): string {
  return contractTypeDef(key)?.short ?? "Помещение"
}

// ── Определение типа по размещению арендатора ───────────────────────────
type FloorKindLike = { kind?: string | null }
type PlacementLike = {
  space?: { kind?: string | null; floor?: FloorKindLike | null } | null
  tenantSpaces?: Array<{ space?: { kind?: string | null; floor?: FloorKindLike | null } | null }> | null
  fullFloors?: Array<FloorKindLike> | null
}

/**
 * Авто-определение типа договора по видам этажей помещений арендатора.
 * Крыша → ROOF, территория → TERRITORY, обычный этаж → PREMISES.
 * «Крышные» без помещения (только антенна) → по умолчанию ROOF.
 */
export function resolveContractTypeForTenant(t: PlacementLike): ContractPlacementType {
  const floorKinds: string[] = []
  if (t.space?.floor?.kind) floorKinds.push(String(t.space.floor.kind).toUpperCase())
  for (const ts of t.tenantSpaces ?? []) {
    if (ts.space?.floor?.kind) floorKinds.push(String(ts.space.floor.kind).toUpperCase())
  }
  for (const f of t.fullFloors ?? []) {
    if (f.kind) floorKinds.push(String(f.kind).toUpperCase())
  }
  if (floorKinds.includes("ROOF")) return "ROOF"
  if (floorKinds.includes("TERRITORY")) return "TERRITORY"
  const hasAnySpace =
    !!t.space || (t.tenantSpaces?.length ?? 0) > 0 || (t.fullFloors?.length ?? 0) > 0
  if (hasAnySpace) return "PREMISES"
  return "ROOF"
}
