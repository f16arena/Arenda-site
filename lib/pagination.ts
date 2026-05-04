export const DEFAULT_PAGE_SIZE = 30

export function normalizePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const page = Number.parseInt(raw ?? "1", 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export function pageSkip(page: number, pageSize = DEFAULT_PAGE_SIZE): number {
  return (Math.max(1, page) - 1) * pageSize
}

export function pageCount(total: number, pageSize = DEFAULT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}
