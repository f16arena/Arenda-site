"use client"

// Общее выпадающее меню: «Создать ▾», «Выгрузить ▾», «⋯» в строке таблицы.
// Рисуется поверх страницы (портал) — таблица с прокруткой его не обрезает,
// закрывается кликом мимо и Esc, работает с клавиатуры. Заменяет самодельные
// <details>/absolute-меню, которые уезжали и обрезались.

import * as React from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type ActionMenuItem =
  | {
      label: React.ReactNode
      icon?: React.ReactNode
      href?: string
      /** Скачивание файла (обычная ссылка, не переход Next) */
      download?: boolean
      onSelect?: () => void
      danger?: boolean
      disabled?: boolean
      separatorBefore?: boolean
    }

const TRIGGER_TONES = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  outline:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  icon:
    "h-7 w-7 justify-center border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800",
} as const

export function ActionMenu({
  label,
  icon,
  items,
  tone = "outline",
  align = "end",
  width = "w-64",
  ariaLabel,
}: {
  label?: React.ReactNode
  icon?: React.ReactNode
  items: ActionMenuItem[]
  tone?: keyof typeof TRIGGER_TONES
  align?: "start" | "end"
  width?: string
  ariaLabel?: string
}) {
  const visible = items.filter(Boolean)
  if (visible.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
          tone === "icon" ? "" : "px-3 py-2",
          TRIGGER_TONES[tone],
        )}
      >
        {icon}
        {label}
        {tone !== "icon" && <ChevronDown className="h-3.5 w-3.5 opacity-70" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn(width, "p-1")}>
        {visible.map((it, i) => (
          <React.Fragment key={i}>
            {it.separatorBefore && i > 0 && <DropdownMenuSeparator />}
            {it.href ? (
              <DropdownMenuItem asChild disabled={it.disabled} className={cn("cursor-pointer gap-2 px-2 py-2", it.danger && "text-red-600 dark:text-red-400")}>
                {it.download ? (
                  <a href={it.href} download>{it.icon}{it.label}</a>
                ) : (
                  <Link href={it.href}>{it.icon}{it.label}</Link>
                )}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={it.disabled}
                onSelect={it.onSelect}
                className={cn("cursor-pointer gap-2 px-2 py-2", it.danger && "text-red-600 dark:text-red-400")}
              >
                {it.icon}
                {it.label}
              </DropdownMenuItem>
            )}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
