import type { ContractState } from "@/lib/contract-engine"
import type { ContractPlacementType } from "@/lib/contract-placement-types"

/**
 * Пресет конструктора под предмет аренды (Этап 3). Мутирует draft (для set()/produce).
 *
 * Помещение/склад — как есть (площадь × ставка, эксплуатационные расходы, уборка).
 * Крыша/территория/реклама/оборудование/парковка — «объекты»: фиксированная аренда,
 * БЕЗ эксплуатационных расходов (нет площади-базы) и БЕЗ уборки помещения; цель
 * использования подставляется по типу (если ещё не задана). Введённые суммы аренды
 * не трогаем — только структуру, чтобы договор соответствовал предмету аренды.
 */
const PURPOSE_BY_TYPE: Partial<Record<ContractPlacementType, string>> = {
  ROOF: "размещения антенно-мачтового сооружения / оборудования",
  TERRITORY: "размещения объекта на прилегающей территории",
  ADVERTISING: "размещения рекламной конструкции",
  EQUIPMENT: "размещения (эксплуатации) оборудования",
  PARKING: "использования парковочного места",
}

export function applyContractTypePreset(draft: ContractState, type: ContractPlacementType): void {
  draft.meta.placementType = type

  // Помещение и склад — стандартный «помещенческий» договор, ничего не меняем.
  if (type === "PREMISES" || type === "WAREHOUSE") return

  // Объекты без площади: эксплуатационных расходов и уборки помещения нет.
  draft.financials.operatingCosts.method = "none"
  draft.financials.additionalServices.premisesCleaning.ordered = false

  // Цель использования — по типу, только если поле пустое (не перетираем введённое).
  if (!draft.premises.purposeUse?.trim()) {
    draft.premises.purposeUse = PURPOSE_BY_TYPE[type] ?? draft.premises.purposeUse
  }

  // Реклама — обычно с вывеской/конструкцией.
  if (type === "ADVERTISING") draft.modules.signageEnabled = true
}
