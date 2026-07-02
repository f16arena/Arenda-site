"use client"

import { useState, type ReactNode, type ElementType } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Карточка-секция настроек со сворачиванием: клик по заголовку прячет/показывает
 * содержимое. Заголовок и рамка — как у прежних секций, тело подставляется как есть
 * (у форм своя внутренняя вёрстка/паддинги).
 */
export function CollapsibleCard({
  title,
  icon: Icon,
  defaultOpen = true,
  headerRight,
  children,
}: {
  title: string
  icon?: ElementType
  defaultOpen?: boolean
  /** Доп. содержимое справа в заголовке (напр. подпись «Подставляются в договоры…»). */
  headerRight?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 bg-slate-50 px-5 py-3.5 text-left transition-colors hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800",
          open && "border-b border-slate-100 dark:border-slate-800",
        )}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {headerRight && <div className="ml-auto text-xs text-slate-400 dark:text-slate-500">{headerRight}</div>}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", !headerRight && "ml-auto", open ? "" : "-rotate-90")} />
      </button>
      {open && children}
    </div>
  )
}
