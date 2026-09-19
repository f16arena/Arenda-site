// Поля арендатора, нужные для расчёта аренды (lib/rent.ts). Один набор на все
// страницы: раньше одни забывали ступенчатый график (rentSchedule), другие —
// доп. помещения или этаж целиком, и суммы аренды расходились.
export const RENT_INPUT_SELECT = {
  fixedMonthlyRent: true,
  customRate: true,
  rentSchedule: true,
  contractStart: true,
  contractEnd: true,
  moveInDate: true,
  paymentDueDay: true,
  rentFreeMonths: true,
  space: { select: { area: true, floor: { select: { ratePerSqm: true } } } },
  tenantSpaces: { select: { space: { select: { area: true, floor: { select: { ratePerSqm: true } } } } } },
  fullFloors: { select: { fixedMonthlyRent: true } },
} as const
