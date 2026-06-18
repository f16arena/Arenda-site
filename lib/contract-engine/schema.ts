// Конструктор договоров аренды — модель данных (ContractState).
// Спецификация: docs commrent_TZ_konstruktor §5. Это чистый TypeScript без
// зависимостей от фреймворка — ядро портируемо и тестируемо отдельно.
//
// ВАЖНО (из карты зависимостей / signing-контур): ContractState — ВНУТРЕННЯЯ
// модель конструктора. Подпись ЭЦП привязывается к `contract.content` как к
// ДЕТЕРМИНИРОВАННОЙ СТРОКЕ (lib/contract-signing-payload.ts, версия
// ARENDA-CONTRACT-SIGN-V1). Поэтому конструктор СОБИРАЕТ договор и рендерит его
// в строку, а не подменяет модель Contract/подписи.

export type Money = number // тенге, целое

export type PartyType = "too" | "ip" | "individual"

/**
 * Подтип физлица. Юридически все — физические лица (ИИН, действуют на основании),
 * но ЧСИ/адвокат/нотариус удобно выбирать отдельно: конструктор сам подставит
 * префикс к наименованию и шаблон основания (лицензия). На форму договора влияет
 * только через итоговые поля name/basis — отдельной орг-правовой формы у них нет.
 */
export type IndividualSubtype = "regular" | "chsi" | "advokat" | "notarius"

export type UtilityKey =
  | "electricity"
  | "coldWater"
  | "hotWater"
  | "heating"
  | "sewerage"
  | "garbage"

export type UtilityMode = "included" | "metered_separate" | "in_operating_costs"

export type OperatingMethod = "none" | "fixed_per_sqm" | "pooled_prorata"
export type OperatingScope = "common_area" | "all_inclusive"
export type PooledBasis = "actual_monthly" | "estimated_with_reconciliation"
export type ReconciliationPeriod = "monthly" | "quarterly" | "annual"

export interface Party {
  type: PartyType
  /** Подтип физлица (только при type==="individual"); по умолч. regular. */
  individualSubtype?: IndividualSubtype
  name: string
  address: string
  bin?: string // ТОО/ИП
  iin?: string // ИП/физлицо
  iik?: string
  bank?: string
  bik?: string
  /** Основание полномочий: авто по type (Устав / Свид-во ИП / Удостоверение) */
  basis: string
  signatory: string
  phone?: string
  email?: string
  /** Удостоверение личности — для физлица (type==="individual"): № / кем выдан /
   *  дата выдачи (dd.MM.yyyy) / действует до. Используется в преамбуле и реквизитах. */
  idDocNumber?: string
  idDocIssuedBy?: string
  idDocIssuedAt?: string
  idDocExpiresAt?: string
}

export interface Premises {
  buildingAddress: string
  placement: string // этаж/№
  spaceAreaSqm: number // драйвер расчётов
  purposeUse: string // целевое назначение (п.1.1)
}

export interface Building {
  /** знаменатель долевого расчёта (pooled_prorata) */
  totalRentableAreaSqm: number
}

export interface OperatingCostsFixed {
  winterRate: Money // окт–апр, тг/кв.м/мес
  summerRate: Money // май–сен, тг/кв.м/мес
}

export interface OperatingCostsPooled {
  basis: PooledBasis
  estimatedRatePerSqm?: Money
  reconciliationPeriod: ReconciliationPeriod
  reconciliationDays: number
}

export interface OperatingCosts {
  method: OperatingMethod
  scope: OperatingScope
  fixed?: OperatingCostsFixed
  pooled?: OperatingCostsPooled
}

export interface ServiceFlag {
  ordered: boolean
  ratePerSqm?: Money
  monthly?: Money
  description?: string
}

export interface AdditionalServices {
  premisesCleaning: ServiceFlag // п.3.6.4
  internet: ServiceFlag // п.3.6.3
  phone: ServiceFlag // п.3.6.3
  premisesSecurity: ServiceFlag
  other: ServiceFlag
}

export interface Penalty {
  tenantPerDay: number // п.8.2, по умолч. 0.5
  tenantCapPercent: number // по умолч. 10
  landlordPerDay: number // п.8.6, default = tenantPerDay
  landlordCapPercent: number // default = tenantCapPercent
}

export interface Indexation {
  enabled: boolean
  capPercent: number
}

export interface Deposit {
  /** Можно отключить: тогда раздел «Депозит» и ВСЕ упоминания депозита в тексте
   *  убираются, а нумерация разделов пересчитывается. */
  enabled: boolean
  amount: Money
  installmentAllowed: boolean
}

export interface Financials {
  monthlyRent: Money
  paymentDueDay: number // 1..28
  vatIncluded: boolean
  penalty: Penalty
  indexation: Indexation
  premisesUtilities: Record<UtilityKey, UtilityMode>
  operatingCosts: OperatingCosts
  deposit: Deposit
  additionalServices: AdditionalServices
}

export interface Term {
  startDate: string // ISO
  endDate: string // ISO
  // autoProlong УДАЛЁН (исправл. 3.11): продление только через ДС
}

export interface Modules {
  insuranceEnabled: boolean // раздел 7
  signageEnabled: boolean // п.1.6, 6.2.3
  actEnabled: boolean // Прил.№1 (default true)
  // Право арендатора на односторонний отказ при непригодности Помещения + возврат
  // депозита (п. «Изменение и расторжение» и п. «Депозит»). Опционально и по
  // умолчанию ВЫКЛ для обратной совместимости: у ранее подписанных договоров этого
  // поля в builderState нет → новые пункты не подмешиваются в их перерисованный
  // DOCX/PDF (он обязан совпадать с подписанным content). defaultState() ставит true.
  tenantExitOnUnusableEnabled?: boolean
}

/** Данные Акта приёма-передачи (Приложение). Пусто → в документе остаётся прочерк. */
export interface HandoverAct {
  conditionWalls: string        // стены
  conditionFloor: string        // пол
  conditionCeiling: string      // потолок
  conditionWindowsDoors: string // окна, двери
  conditionElectrical: string   // электропроводка, освещение
  conditionPlumbing: string     // сантехника, отопление
  conditionOther: string        // иное
  keysCount: string             // кол-во комплектов ключей
  meterElectricity: string      // показание счётчика электроэнергии, кВт·ч
  meterColdWater: string        // холодная вода, куб. м
  meterHotWater: string         // горячая вода, куб. м
}

export interface ContractMeta {
  contractNumber: string
  contractDate: string // ISO
  city: string
  // Тип договора по предмету аренды (PREMISES/ROOF/TERRITORY/…). См.
  // lib/contract-placement-types.ts. Подставляется авто по размещению арендатора.
  placementType?: string
}

export interface ContractState {
  meta: ContractMeta
  landlord: Party
  tenant: Party
  building: Building
  premises: Premises
  financials: Financials
  term: Term
  modules: Modules
  handoverAct: HandoverAct
  /** зафиксирован ли договор (после подписания меняется только через ДС) */
  signed: boolean
}

// ───────────────────────────── defaults ─────────────────────────────

function defaultParty(): Party {
  return {
    type: "too",
    name: "ТОО «________»",
    address: "",
    bin: "",
    iin: "",
    iik: "",
    bank: "",
    bik: "",
    basis: "Устава",
    signatory: "________",
  }
}

export function defaultState(): ContractState {
  return {
    meta: { contractNumber: "", contractDate: "", city: "г. Усть-Каменогорск" },
    landlord: defaultParty(),
    tenant: { ...defaultParty(), phone: "", email: "" },
    building: { totalRentableAreaSqm: 0 },
    premises: {
      buildingAddress: "",
      placement: "",
      spaceAreaSqm: 0,
      purposeUse: "торговой / офисной деятельности",
    },
    financials: {
      monthlyRent: 0,
      paymentDueDay: 5,
      vatIncluded: true,
      penalty: { tenantPerDay: 0.5, tenantCapPercent: 10, landlordPerDay: 0.5, landlordCapPercent: 10 },
      indexation: { enabled: true, capPercent: 10 },
      premisesUtilities: {
        electricity: "metered_separate",
        coldWater: "included",
        hotWater: "included",
        heating: "included",
        sewerage: "included",
        garbage: "included",
      },
      operatingCosts: {
        method: "none",
        scope: "common_area",
        fixed: { winterRate: 0, summerRate: 0 },
        pooled: {
          basis: "estimated_with_reconciliation",
          estimatedRatePerSqm: 0,
          reconciliationPeriod: "quarterly",
          reconciliationDays: 10,
        },
      },
      deposit: { enabled: true, amount: 0, installmentAllowed: false },
      additionalServices: {
        premisesCleaning: { ordered: false, ratePerSqm: 0 },
        internet: { ordered: false, monthly: 0 },
        phone: { ordered: false },
        premisesSecurity: { ordered: false, monthly: 0 },
        other: { ordered: false },
      },
    },
    term: { startDate: "", endDate: "" },
    modules: { insuranceEnabled: true, signageEnabled: true, actEnabled: true, tenantExitOnUnusableEnabled: true },
    handoverAct: {
      conditionWalls: "", conditionFloor: "", conditionCeiling: "", conditionWindowsDoors: "",
      conditionElectrical: "", conditionPlumbing: "", conditionOther: "",
      keysCount: "", meterElectricity: "", meterColdWater: "", meterHotWater: "",
    },
    signed: false,
  }
}

/** Порядок и подписи коммунальных ресурсов (для перечислений в тексте). */
export const UTILITY_LABELS: Record<UtilityKey, string> = {
  electricity: "Электроэнергия",
  coldWater: "Холодная вода",
  hotWater: "Горячая вода",
  heating: "Отопление",
  sewerage: "Водоотведение",
  garbage: "Вывоз мусора",
}

/** Родительный падеж ресурса («стоимость …») */
export const UTILITY_GENITIVE: Record<UtilityKey, string> = {
  electricity: "потреблённой электроэнергии",
  coldWater: "холодного водоснабжения",
  hotWater: "горячего водоснабжения",
  heating: "теплоснабжения",
  sewerage: "водоотведения",
  garbage: "вывоза мусора",
}

export const UTILITY_ORDER: UtilityKey[] = [
  "electricity",
  "coldWater",
  "hotWater",
  "heating",
  "sewerage",
  "garbage",
]
