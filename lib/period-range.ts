/**
 * Период «с месяца по месяц» (формат YYYY-MM). По умолчанию — текущий год
 * (январь–декабрь). Поддерживает старый параметр year для обратной совместимости.
 */
export function resolveMonthRange(params: { from?: string | null; to?: string | null; year?: string | null }) {
  const now = new Date()
  const valid = (s?: string | null) => (s && /^\d{4}-\d{2}$/.test(s) ? s : null)

  let from = valid(params.from)
  let to = valid(params.to)
  if (!from || !to) {
    const y = params.year && /^\d{4}$/.test(params.year) ? params.year : String(now.getFullYear())
    from = from ?? `${y}-01`
    to = to ?? `${y}-12`
  }
  if (from > to) [from, to] = [to, from]

  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  return {
    from,
    to,
    fromDate: new Date(fy, fm - 1, 1),       // первый день месяца "с"
    toEndExclusive: new Date(ty, tm, 1),     // первый день месяца ПОСЛЕ "по"
    toEndDate: new Date(ty, tm, 0),          // последний день месяца "по"
  }
}
