// Конструктор договоров аренды — модель данных (ContractState).
// Спецификация: docs commrent_TZ_konstruktor §5. Это чистый TypeScript без
// зависимостей от фреймворка — ядро портируемо и тестируемо отдельно.
//
// ВАЖНО (из карты зависимостей / signing-контур): ContractState — ВНУТРЕННЯЯ
// модель конструктора. Подпись ЭЦП привязывается к `contract.content` как к
// ДЕТЕРМИНИРОВАННОЙ СТРОКЕ (lib/contract-signing-payload.ts, версия
// ARENDA-CONTRACT-SIGN-V1). Поэтому конструктор СОБИРАЕТ договор и рендерит его
// в строку, а не подменяет модель Contract/подписи.
//
// ЯЗЫК: подписи ресурсов и состояний (UTILITY_LABELS и рядом) перечислены
// теми же словами в пунктах договора — остаются русскими
// (docs/i18n-documents-plan.md).

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

/** Ступень графика арендной платы (ступенчатая аренда, п. «Арендная плата»). */
export interface RentStep {
  /** Начало действия ступени, "YYYY-MM" (включительно). Первая ступень обычно = месяц начала аренды. */
  from: string
  amount: Money
}

/**
 * Урегулирование ранее образовавшейся задолженности (входящий долг легаси-арендатора,
 * продолжающего отношения по новому договору). При enabled добавляется отдельный
 * раздел договора, а при подписании — начисление-остаток (Charge type OTHER),
 * см. lib/opening-debt.ts.
 */
export interface DebtSettlement {
  enabled: boolean
  /** Долг на дату заключения договора, тенге. */
  totalAmount: Money
  /** Документ-подтверждение («Акт сверки взаимных расчётов № 27 от 29.06.2026 г.»). Пусто — без ссылки. */
  basisDoc: string
  /** Прощаемая часть, % (0 — без уменьшения). Остаток = totalAmount × (1 − %/100). */
  discountPercent: number
  /** Срок погашения остатка, месяцев со дня подписания. */
  payWithinMonths: number
}

export interface Financials {
  monthlyRent: Money
  /** Ступенчатая аренда: ≥2 ступеней заменяют текст пункта о размере платы.
   *  Опционально (старые договоры поля не имеют — рендер не меняется).
   *  UI держит monthlyRent = сумме первой ступени (база для депозита/синка). */
  rentSteps?: RentStep[]
  /** Входящий долг. Опционально; отсутствие = выключено (обратная совместимость). */
  debtSettlement?: DebtSettlement
  paymentDueDay: number // 1..28
  vatIncluded: boolean
  penalty: Penalty
  indexation: Indexation
  premisesUtilities: Record<UtilityKey, UtilityMode>
  operatingCosts: OperatingCosts
  deposit: Deposit
  additionalServices: AdditionalServices
}

/** Остаток входящего долга к погашению (2 знака). */
export function debtRemainder(d: DebtSettlement): number {
  const pct = Math.min(Math.max(d.discountPercent || 0, 0), 100)
  return Math.round(d.totalAmount * (100 - pct)) / 100
}

/** Корректные ступени графика аренды (валидный месяц + сумма), в порядке возрастания. */
export function validRentSteps(steps: RentStep[] | null | undefined): RentStep[] {
  return (steps ?? [])
    .filter((st) => /^\d{4}-\d{2}$/.test(st.from || "") && st.amount > 0)
    .sort((a, b) => a.from.localeCompare(b.from))
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
  // Раздел «Состояние Помещения и осведомлённость Арендатора» («как есть»,
  // отказ от претензий) — для арендаторов, уже занимающих помещение по ранее
  // действовавшему договору. Опционально, по умолчанию ВЫКЛ; у старых договоров
  // поля нет → раздел не подмешивается (обратная совместимость).
  asIsAcceptanceEnabled?: boolean
  // Право арендатора на односторонний отказ при непригодности Помещения + возврат
  // депозита (п. «Изменение и расторжение» и п. «Депозит»). Опционально и по
  // умолчанию ВЫКЛ для обратной совместимости: у ранее подписанных договоров этого
  // поля в builderState нет → новые пункты не подмешиваются в их перерисованный
  // DOCX/PDF (он обязан совпадать с подписанным content). defaultState() ставит true.
  tenantExitOnUnusableEnabled?: boolean
  // Раздел «Конфиденциальность». Опционально; по умолчанию ВКЛ. Обратная
  // совместимость: у старых договоров поля нет → `!== false` оставляет раздел
  // (как и было), поэтому перерисованный документ совпадает с подписанным.
  confidentialityEnabled?: boolean
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

/**
 * Договоры на размещение (не помещение): оборудование в здании (вендинг,
 * банкомат, кофе-точка) или временный объект на территории (киоск, контейнер).
 * Семейство задаёт СВОЙ набор пунктов и приложений (lib/contract-engine/placement.ts).
 * Блок опционален: у ранее подписанных договоров его нет — они рендерятся
 * прежним текстом, байт-в-байт как при подписании.
 */
export type PlacementFamily = "equipment" | "territory"

/** Строка перечня оборудования (или описание временного объекта на территории). */
export interface PlacedEquipment {
  name: string // «Торговый автомат», «Киоск»
  model: string
  serial: string // заводской номер
  qty: number
  size: string // габариты, «900×800×1830 мм»
  powerKw: number // потребляемая мощность, кВт (0 — не подключается)
}

/** Электроснабжение места: по отдельному счётчику, фикс-платой или без подключения. */
export type PlacementElectricity = "meter" | "fixed" | "none"

export interface PlacementTerms {
  family: PlacementFamily
  placeAreaSqm: number // площадь Места
  placeDescription: string // где именно: «холл 1 этажа, справа от входа»
  placeCondition: string // состояние Места/покрытия на момент передачи (для Акта)
  equipment: PlacedEquipment[]
  electricity: PlacementElectricity
  electricityFixed: Money // ₸/мес при electricity = fixed
  /** Тариф за 1 кВт·ч при electricity = meter; 0 — «по тарифам энергоснабжающей организации».
   *  Индивидуальный для арендатора (тариф здания для всех может быть другим). */
  electricityTariff?: Money
  /** Эксплуатационные расходы, ₸ за 1 м² Места в месяц, круглый год; 0 — нет. */
  serviceFeePerSqm?: Money
  powerLimitKw: number // разрешённая суммарная мощность (0 — не ограничивается в тексте)
  connectionPoint: string // точка подключения к электросети
  accessHours: string // режим доступа для обслуживания
  /** Территория: правоустанавливающий документ на земельный участок и кадастровый номер. */
  landDocument: string
  cadastralNumber: string
  /** Приложение «Схема размещения» (границы Места). */
  schemeEnabled: boolean
}

export function defaultPlacementTerms(family: PlacementFamily): PlacementTerms {
  return {
    family,
    placeAreaSqm: 0,
    placeDescription: "",
    placeCondition: "",
    equipment: [],
    electricity: "meter",
    electricityFixed: 0,
    electricityTariff: 0,
    serviceFeePerSqm: 0,
    powerLimitKw: 0,
    connectionPoint: "",
    accessHours: family === "equipment" ? "ежедневно в часы работы здания" : "ежедневно с 07:00 до 23:00",
    landDocument: "",
    cadastralNumber: "",
    schemeEnabled: true,
  }
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
  /** Условия размещения (договор на оборудование / территорию). Нет — договор аренды помещения. */
  placement?: PlacementTerms
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
      rentSteps: [],
      debtSettlement: { enabled: false, totalAmount: 0, basisDoc: "", discountPercent: 0, payWithinMonths: 2 },
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
    modules: { insuranceEnabled: true, signageEnabled: true, actEnabled: true, tenantExitOnUnusableEnabled: true, confidentialityEnabled: true, asIsAcceptanceEnabled: false },
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
