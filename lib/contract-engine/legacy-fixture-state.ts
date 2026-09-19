// Состояние «как у ранее подписанных договоров»: без блока placement. Тексты
// таких договоров обязаны рендериться байт-в-байт как при подписании — это
// сверяется с эталонами в __fixtures__ (снятыми до появления новых договоров).
import { defaultState, type ContractState } from "./schema"

export const LEGACY_CASES = [
  ["PREMISES", "2 этаж, помещение 205", 45, 450000],
  ["TERRITORY", "Киоск на территории, Участок", 0, 80000],
  ["EQUIPMENT", "Вендинговый автомат, холл 1 этажа", 0, 30000],
  ["ROOF", "Антенно-мачтовое сооружение, Крыша", 0, 150000],
] as const

export function legacyState(type: string, placement: string, area: number, rent: number): ContractState {
  const s = defaultState()
  s.meta.contractNumber = "01-001"
  s.meta.contractDate = "2026-09-19"
  s.meta.placementType = type
  s.landlord.name = "ТОО «F16»"
  s.landlord.signatory = "Иванов И.И."
  s.tenant.name = "ИП MTA"
  s.tenant.signatory = "Петров П.П."
  s.premises.buildingAddress = "г. Усть-Каменогорск, ул. Примерная, 16"
  s.premises.placement = placement
  s.premises.spaceAreaSqm = area
  s.financials.monthlyRent = rent
  s.financials.deposit.amount = rent
  s.term.startDate = "2026-10-01"
  s.term.endDate = "2027-08-31"
  if (type !== "PREMISES") {
    s.financials.operatingCosts.method = "none"
    s.premises.purposeUse = "размещения (эксплуатации) оборудования"
  }
  return s
}
