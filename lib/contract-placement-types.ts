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
  { key: "EQUIPMENT", label: "Размещение оборудования", short: "Оборудование", core: false,
    description: "Автоматы (хватайка, вендинг), банкоматы, кофемашины — размещение оборудования арендатора (фикс-сумма, без эксп.сбора)." },
  { key: "PARKING", label: "Аренда парковочного места", short: "Парковка", core: false,
    description: "Парковочное место." },
]

const BY_KEY = new Map(CONTRACT_PLACEMENT_TYPES.map((t) => [t.key, t]))

// ── Терминология текста договора по типу предмета ───────────────────────
// Подзаголовок под «ДОГОВОР № …» и заголовок Акта. Для «помещенческих» типов —
// «аренды нежилого помещения», для объектов — по предмету.
const DOC_SUBTITLE: Record<ContractPlacementType, string> = {
  PREMISES: "аренды нежилого помещения",
  WAREHOUSE: "аренды нежилого помещения (склада)",
  ROOF: "аренды места на крыше/фасаде",
  TERRITORY: "аренды места на прилегающей территории",
  ADVERTISING: "о размещении рекламной конструкции",
  EQUIPMENT: "о размещении оборудования",
  PARKING: "аренды парковочного места",
}
const ACT_SUBTITLE: Record<ContractPlacementType, string> = {
  PREMISES: "приёма-передачи нежилого помещения",
  WAREHOUSE: "приёма-передачи нежилого помещения (склада)",
  ROOF: "приёма-передачи места на крыше/фасаде",
  TERRITORY: "приёма-передачи места на территории",
  ADVERTISING: "приёма-передачи места для рекламной конструкции",
  EQUIPMENT: "приёма-передачи места для размещения оборудования",
  PARKING: "приёма-передачи парковочного места",
}

/** Подзаголовок договора под «ДОГОВОР № …» — зависит от типа предмета. */
export function contractDocSubtitle(type: string | null | undefined): string {
  return DOC_SUBTITLE[type as ContractPlacementType] ?? DOC_SUBTITLE.PREMISES
}
/** Заголовок Акта приёма-передачи — зависит от типа предмета. */
export function contractActSubtitle(type: string | null | undefined): string {
  return ACT_SUBTITLE[type as ContractPlacementType] ?? ACT_SUBTITLE.PREMISES
}
/** «Помещенческие» типы (помещение/склад) — стандартный текст «нежилое помещение». */
export function isPremisesLikeType(type: string | null | undefined): boolean {
  return !type || type === "PREMISES" || type === "WAREHOUSE"
}
/** Название позиции аренды в счёте/АВР по типу предмета. */
export function rentItemName(type: string | null | undefined, period: string): string {
  if (type === "EQUIPMENT") return `Размещение оборудования за ${period}`
  if (type === "ADVERTISING") return `Размещение рекламной конструкции за ${period}`
  if (type === "PARKING") return `Аренда парковочного места за ${period}`
  if (type === "ROOF") return `Аренда места на крыше/фасаде за ${period}`
  if (type === "TERRITORY") return `Аренда места на территории за ${period}`
  return `Аренда нежилого помещения за ${period}`
}

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
