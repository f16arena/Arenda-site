"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type DataTableDensity = "compact" | "normal" | "comfortable"

interface DataTableProps extends React.HTMLAttributes<HTMLTableElement> {
  children: React.ReactNode
  className?: string
  /** Wrapper класс — для overflow-x контейнера. */
  wrapperClassName?: string
  density?: DataTableDensity
}

/**
 * Тонкая обёртка над <table> с пресетами плотности (`density`).
 * - `compact` — максимум строк на экран (px-3 py-2, td:text-xs).
 * - `normal` (default) — стандарт админки.
 * - `comfortable` — увеличенные отступы для важных таблиц.
 *
 * Стили применяются ко вложенным `th` / `td` через arbitrary-variant селекторы Tailwind,
 * поэтому существующие классы на ячейках продолжат работать (twMerge не отменит их —
 * мы пишем псевдо-класс на родителе, а не дублируем `padding` на ячейках).
 */
export function DataTable({
  children,
  className,
  wrapperClassName,
  density = "normal",
  ...rest
}: DataTableProps) {
  return (
    <div className={cn("overflow-x-auto", wrapperClassName)}>
      <table
        className={cn(
          "w-full text-sm",
          density === "compact" && "[&_th]:py-2 [&_th]:px-3 [&_td]:py-2 [&_td]:px-3 [&_td]:text-xs",
          density === "normal" && "[&_th]:py-3 [&_th]:px-4 [&_td]:py-2.5 [&_td]:px-4",
          density === "comfortable" && "[&_th]:py-4 [&_th]:px-5 [&_td]:py-3 [&_td]:px-5",
          className,
        )}
        {...rest}
      >
        {children}
      </table>
    </div>
  )
}
