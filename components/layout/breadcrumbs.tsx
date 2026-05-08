import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export type Crumb = { label: string; href?: string }

/**
 * Хлебные крошки. Last item без href — это «текущая» страница.
 *
 * Не клиентский — может рендериться напрямую из server-component.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400",
        className,
      )}
    >
      {items.map((item, idx) => (
        <span key={`${idx}-${item.label}`} className="flex items-center gap-1.5">
          {idx > 0 && (
            <ChevronRight
              aria-hidden
              className="h-3 w-3 text-slate-300 dark:text-slate-600"
            />
          )}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span
              aria-current={idx === items.length - 1 ? "page" : undefined}
              className="text-slate-700 dark:text-slate-300"
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
