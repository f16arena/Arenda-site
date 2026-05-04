import Link from "next/link"
import { pageCount } from "@/lib/pagination"
import { cn } from "@/lib/utils"

export function PaginationControls({
  basePath,
  page,
  pageSize,
  total,
  params,
  pageParam = "page",
}: {
  basePath: string
  page: number
  pageSize: number
  total: number
  params?: Record<string, string | number | null | undefined>
  pageParam?: string
}) {
  const pages = pageCount(total, pageSize)
  if (pages <= 1) return null

  const current = Math.min(Math.max(1, page), pages)
  const from = (current - 1) * pageSize + 1
  const to = Math.min(total, current * pageSize)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 text-sm dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {from}-{to} из {total}
      </p>
      <div className="flex items-center gap-2">
        <PageLink
          href={hrefFor(basePath, params, pageParam, current - 1)}
          disabled={current <= 1}
        >
          Назад
        </PageLink>
        <span className="px-2 text-xs text-slate-500 dark:text-slate-400">
          {current} / {pages}
        </span>
        <PageLink
          href={hrefFor(basePath, params, pageParam, current + 1)}
          disabled={current >= pages}
        >
          Далее
        </PageLink>
      </div>
    </div>
  )
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled?: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-slate-100 px-3 py-1.5 text-xs font-medium text-slate-300 dark:border-slate-800 dark:text-slate-600">
        {children}
      </span>
    )
  }

  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50",
        "dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50",
      )}
    >
      {children}
    </Link>
  )
}

function hrefFor(
  basePath: string,
  params: Record<string, string | number | null | undefined> | undefined,
  pageParam: string,
  page: number,
) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === "" || value === "all") continue
    query.set(key, String(value))
  }
  if (page > 1) query.set(pageParam, String(page))
  else query.delete(pageParam)
  const qs = query.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
