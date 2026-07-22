"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * Вкладки-ссылки для «хабов» (редизайн, этап 1): несколько связанных страниц
 * выглядят как один раздел с вкладками, но остаются отдельными роутами со
 * своими данными и правами. Пример: Команда = /admin/staff + /admin/users +
 * /admin/roles. Активная вкладка — по точному совпадению pathname.
 */
export function RouteTabs({ items, className }: {
  items: { href: string; label: string }[]
  className?: string
}) {
  const pathname = usePathname()
  return (
    <nav className={cn("flex flex-wrap items-center gap-1 border-b border-border", className)} aria-label="Разделы">
      {items.map((item) => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
