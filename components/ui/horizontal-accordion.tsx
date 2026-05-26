"use client"

import { Children, isValidElement, useState, type ElementType, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Горизонтальная лента-аккордеон. Все заголовки видны одной строкой/сеткой
 * сверху, при клике на любой — раскрывается полный контент карточки во всю
 * ширину под лентой. Раскрыта всегда РОВНО ОДНА карточка (или ни одной).
 * Повторный клик на активный заголовок — закрывает.
 *
 * Использование:
 *   <HorizontalAccordion defaultActiveId="contact">
 *     <AccordionItem id="contact" title="Контактное лицо" icon={User} meta="+777..">
 *       <form>...</form>
 *     </AccordionItem>
 *     <AccordionItem id="company" title="Данные компании">
 *       <form>...</form>
 *     </AccordionItem>
 *   </HorizontalAccordion>
 *
 * AccordionItem — маркер-компонент, ничего сам не рендерит; HorizontalAccordion
 * парсит его props через React.Children + isValidElement.
 */

export type AccordionItemProps = {
  id: string
  title: string
  icon?: ElementType
  meta?: ReactNode
  /** Содержимое раскрытого состояния — рендерится только если карточка активна */
  children: ReactNode
}

export function AccordionItem(_props: AccordionItemProps): null {
  return null
}

export function HorizontalAccordion({
  children,
  defaultActiveId,
}: {
  children: ReactNode
  defaultActiveId?: string
}) {
  // Извлекаем props всех валидных AccordionItem'ов из children
  const items: AccordionItemProps[] = []
  Children.forEach(children, (child) => {
    if (isValidElement<AccordionItemProps>(child) && child.type === AccordionItem) {
      items.push(child.props)
    }
  })

  const [activeId, setActiveId] = useState<string | null>(defaultActiveId ?? null)
  const active = items.find((item) => item.id === activeId) ?? null

  return (
    <div className="space-y-4">
      {/* Лента заголовков. На мобиле 2-3 в ряд, на десктопе вмещаются все.
          flex-wrap чтобы не было горизонтального скролла. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(isActive ? null : item.id)}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                isActive
                  ? "border-blue-500 bg-blue-50 dark:border-blue-500/60 dark:bg-blue-500/15"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/70",
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500",
                  )}
                />
              )}
              <span
                className={cn(
                  "truncate text-xs font-medium",
                  isActive ? "text-blue-900 dark:text-blue-100" : "text-slate-900 dark:text-slate-100",
                )}
                title={item.title}
              >
                {item.title}
              </span>
            </button>
          )
        })}
      </div>

      {/* Контент активной карточки на полную ширину */}
      {active ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex min-w-0 items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/50">
            {active.icon && (() => {
              const Icon = active.icon!
              return <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            })()}
            <span className="shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100">{active.title}</span>
            {active.meta && (
              <span className="ml-auto min-w-0 text-xs font-normal text-slate-500 dark:text-slate-400" title={typeof active.meta === "string" ? active.meta : undefined}>
                {active.meta}
              </span>
            )}
          </div>
          <div>{active.children}</div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center dark:border-slate-800 dark:bg-slate-800/20">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Выберите карточку выше — содержимое появится здесь
          </p>
        </div>
      )}
    </div>
  )
}
