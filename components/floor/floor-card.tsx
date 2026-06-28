"use client"

import { useState, useEffect, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Карточка этажа в «Помещениях» с раскрытием/сворачиванием по клику на шапку.
 * Тело (план + список кабинетов) скрывается, чтобы длинные списки этажей не
 * занимали весь экран. Состояние запоминается для каждого этажа в localStorage.
 *
 * page.tsx — серверный компонент, поэтому шапка приходит готовыми нодами:
 *   title   — левая часть (иконка/название/ставка), служит кнопкой сворачивания;
 *   actions — правая часть (счётчики + ссылка «Настройки этажа»), клики по ней
 *             НЕ сворачивают этаж (stopPropagation).
 */
export function FloorCard({
  floorId,
  accent,
  title,
  actions,
  children,
}: {
  floorId: string
  accent?: boolean
  title: ReactNode
  actions: ReactNode
  children: ReactNode
}) {
  const key = `floorcard:collapsed:${floorId}`
  // Стартуем развёрнутыми (как на сервере), затем читаем сохранённое состояние
  // после монтирования — иначе hydration mismatch между SSR и localStorage.
  const [collapsed, setCollapsed] = useState(false)

  // Читаем сохранённое состояние ПОСЛЕ монтирования (не в initializer и не на
  // сервере) — иначе SSR-разметка (развёрнуто) разойдётся с localStorage на клиенте
  // (hydration mismatch). Это и есть рекомендованный hydration-safe паттерн.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(key) === "1") setCollapsed(true)
    } catch {
      /* приватный режим */
    }
  }, [key])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(key, next ? "1" : "0")
      } catch {
        /* приватный режим */
      }
      return next
    })
  }

  // Клик по всей шапке сворачивает этаж, КРОМЕ кликов по ссылкам/кнопкам внутри
  // (ссылка «Настройки этажа», действия) — чтобы они работали как обычно.
  const onHeaderClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return
    toggle()
  }

  return (
    <div
      id={`floor-${floorId}`}
      className={cn(
        "scroll-mt-20 bg-white dark:bg-slate-900 rounded-2xl border overflow-hidden",
        accent
          ? "border-violet-300 dark:border-violet-500/40"
          : "border-slate-200 dark:border-slate-800",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        title={collapsed ? "Развернуть этаж" : "Свернуть этаж"}
        onClick={onHeaderClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            toggle()
          }
        }}
        className="flex cursor-pointer select-none items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 transition-transform",
              collapsed && "-rotate-90",
            )}
          />
          {title}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          {actions}
        </div>
      </div>
      {!collapsed && children}
    </div>
  )
}
