import { defaultPlacementTerms, defaultState, type ContractState, type PlacementFamily } from "@/lib/contract-engine"
import type { ContractPlacementType } from "@/lib/contract-placement-types"

/**
 * Пресет конструктора под предмет аренды (Этап 3). Мутирует draft (для set()/produce).
 *
 * Помещение/склад — как есть (площадь × ставка, эксплуатационные расходы, уборка).
 * Размещение оборудования и территория — отдельные договоры со своим текстом и
 * приложениями (draft.placement, см. lib/contract-engine/placement.ts).
 * Крыша/реклама/парковка — «объекты»: фиксированная аренда, БЕЗ эксплуатационных
 * расходов и уборки помещения (операторы связи работают по своим договорам).
 * Введённые суммы аренды не трогаем — только структуру.
 */
const PURPOSE_BY_TYPE: Partial<Record<ContractPlacementType, string>> = {
  ROOF: "размещения антенно-мачтового сооружения / оборудования",
  TERRITORY: "размещения временного сооружения Арендатора и осуществления в нём предпринимательской деятельности",
  ADVERTISING: "размещения рекламной конструкции",
  EQUIPMENT: "размещения и эксплуатации оборудования Арендатора",
  PARKING: "использования парковочного места",
}

const FAMILY_BY_TYPE: Partial<Record<ContractPlacementType, PlacementFamily>> = {
  EQUIPMENT: "equipment",
  TERRITORY: "territory",
}

/** Цель использования подставлена автоматически (а не введена руками) — её можно заменить. */
function isAutoPurpose(v: string | undefined): boolean {
  const t = v?.trim() ?? ""
  return !t || t === defaultState().premises.purposeUse || Object.values(PURPOSE_BY_TYPE).includes(t)
}

export function applyContractTypePreset(draft: ContractState, type: ContractPlacementType): void {
  draft.meta.placementType = type

  // Помещение и склад — стандартный «помещенческий» договор.
  if (type === "PREMISES" || type === "WAREHOUSE") {
    delete draft.placement
    if (isAutoPurpose(draft.premises.purposeUse) && draft.premises.purposeUse !== defaultState().premises.purposeUse) {
      draft.premises.purposeUse = defaultState().premises.purposeUse
    }
    return
  }

  // Объекты без площади-базы: эксплуатационных расходов и уборки помещения нет.
  draft.financials.operatingCosts.method = "none"
  draft.financials.additionalServices.premisesCleaning.ordered = false

  // Цель использования — по типу, если её не вводили руками. Раньше подставлялась
  // только в пустое поле, а по умолчанию оно уже заполнено «торговой / офисной
  // деятельности» — и в договоре на автомат оставалась офисная цель.
  if (isAutoPurpose(draft.premises.purposeUse)) {
    draft.premises.purposeUse = PURPOSE_BY_TYPE[type] ?? draft.premises.purposeUse
  }

  const family = FAMILY_BY_TYPE[type]
  if (family) {
    if (draft.placement?.family !== family) {
      const prev = draft.placement
      const t = defaultPlacementTerms(family)
      // переносим то, что уже известно о месте (из карточки или прошлого выбора)
      t.placeAreaSqm = prev?.placeAreaSqm || draft.premises.spaceAreaSqm || 0
      t.placeDescription = prev?.placeDescription || draft.premises.placement || ""
      t.equipment = prev?.equipment ?? []
      t.electricity = prev?.electricity ?? t.electricity
      t.electricityFixed = prev?.electricityFixed ?? 0
      t.powerLimitKw = prev?.powerLimitKw ?? 0
      t.connectionPoint = prev?.connectionPoint ?? ""
      draft.placement = t
    }
    // Договор на размещение не про помещение: ни «как есть», ни вывесок на
    // здании, ни доп. услуг помещения. Страхование ГПО — для территории
    // (киоск с посетителями), для автомата по умолчанию выключено.
    draft.modules.asIsAcceptanceEnabled = false
    draft.modules.signageEnabled = false
    draft.modules.insuranceEnabled = family === "territory"
    const sv = draft.financials.additionalServices
    sv.internet.ordered = false
    sv.phone.ordered = false
    sv.premisesSecurity.ordered = false
    sv.other.ordered = false
    return
  }

  delete draft.placement
  // Реклама — обычно с вывеской/конструкцией.
  if (type === "ADVERTISING") draft.modules.signageEnabled = true
}
