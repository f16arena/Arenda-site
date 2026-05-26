import { Children, isValidElement, type ElementType, type ReactNode } from "react"

/**
 * Server-component табы с CSS-only переключением (без JavaScript,
 * без "use client"). Работает на нативных radio + label + sibling
 * CSS-селекторах через :has() (фича 2023, все актуальные браузеры).
 *
 * Главное преимущество перед client-component Tabs: children
 * рендерятся СЕРВЕРОМ напрямую в HTML, поэтому внутри Tab можно
 * безопасно использовать inline server actions, `<form action={async}>`,
 * server components — никаких проблем с client/server boundary.
 *
 * Использование:
 *   <Tabs name="tenant-card" defaultActiveId="contact">
 *     <Tab id="contact" title="Контактное лицо" icon={User} meta="+777..">
 *       <form>...</form>
 *     </Tab>
 *     <Tab id="company" title="Данные компании">...</Tab>
 *   </Tabs>
 *
 * Все content-панели рендерятся в DOM одновременно (включая Lazy)
 * — переключение между ними чисто CSS (display:none/block). Это
 * trade-off: больше начального HTML, но мгновенное переключение
 * и работа без JS.
 */

export type TabProps = {
  id: string
  title: string
  icon?: ElementType
  meta?: ReactNode
  children: ReactNode
}

// Tab — server-side маркер. Сам не рендерит ничего — props собирает
// родитель через React.Children и сам формирует HTML структуру.
export function Tab(_props: TabProps): null {
  return null
}

export function Tabs({
  children,
  name,
  defaultActiveId,
}: {
  children: ReactNode
  /** Имя radio-группы. Должно быть уникальным на странице (используется
   *  и для radio name, и как префикс ID для CSS селекторов). */
  name: string
  /** ID таба, открытый по умолчанию. Если не задан — первый. */
  defaultActiveId?: string
}) {
  const items: TabProps[] = []
  Children.forEach(children, (child) => {
    if (isValidElement<TabProps>(child) && child.type === Tab) {
      items.push(child.props)
    }
  })

  if (items.length === 0) return null
  const activeId = defaultActiveId ?? items[0].id

  // CSS: каждая панель скрыта по умолчанию, видна только если
  // соответствующий radio :checked. Селектор `:has()` находит активный
  // radio внутри tabs-контейнера и показывает соответствующую панель.
  // Также активный таб (label) получает подсветку.
  const css = items
    .map(
      (item) => `
.${cssClass(name)} > #${tabId(name, item.id)}:checked ~ .${cssClass(name)}-panels > #${panelId(name, item.id)} { display: block; }
.${cssClass(name)} > #${tabId(name, item.id)}:checked ~ .${cssClass(name)}-labels > label[for="${tabId(name, item.id)}"] {
  background: rgb(239 246 255);
  color: rgb(29 78 216);
  border-bottom-color: rgb(37 99 235);
}
.dark .${cssClass(name)} > #${tabId(name, item.id)}:checked ~ .${cssClass(name)}-labels > label[for="${tabId(name, item.id)}"] {
  background: rgb(30 58 138 / 0.2);
  color: rgb(147 197 253);
  border-bottom-color: rgb(59 130 246);
}
`,
    )
    .join("")

  return (
    <div className={cssClass(name)}>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Все radio inputs ДО labels/panels — sibling-селектор `~` работает
          только для последующих соседей. sr-only прячет визуально. */}
      {items.map((item) => (
        <input
          key={`r-${item.id}`}
          type="radio"
          name={name}
          id={tabId(name, item.id)}
          defaultChecked={item.id === activeId}
          className="sr-only"
        />
      ))}

      {/* Лента табов. flex-wrap на случай если на маленьком экране не помещаются. */}
      <div className={`${cssClass(name)}-labels flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800 mb-4 overflow-x-auto`}>
        {items.map((item) => {
          const Icon = item.icon
          return (
            <label
              key={item.id}
              htmlFor={tabId(name, item.id)}
              className="group/tab flex shrink-0 cursor-pointer items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              title={typeof item.meta === "string" ? `${item.title} — ${item.meta}` : item.title}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span className="whitespace-nowrap">{item.title}</span>
              {item.meta && (
                <span className="hidden text-xs text-slate-400 dark:text-slate-500 lg:inline" aria-hidden="true">
                  {typeof item.meta === "string" && item.meta.length > 20 ? "" : item.meta}
                </span>
              )}
            </label>
          )
        })}
      </div>

      {/* Контейнер панелей. Все панели в DOM, видна только активная (CSS). */}
      <div className={`${cssClass(name)}-panels`}>
        {items.map((item) => (
          <div
            key={item.id}
            id={panelId(name, item.id)}
            className="tab-panel hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            {item.children}
          </div>
        ))}
      </div>
    </div>
  )
}

// Хелперы для генерации стабильных id/class. Принимают только [a-z0-9-_]
// (без спецсимволов в CSS селекторах). Падение selector'а ломает всю
// группу, поэтому ID имена ВАЖНО держать безопасными.
function cssClass(name: string): string {
  return `tabs-${sanitize(name)}`
}

function tabId(name: string, itemId: string): string {
  return `tab-${sanitize(name)}-${sanitize(itemId)}`
}

function panelId(name: string, itemId: string): string {
  return `panel-${sanitize(name)}-${sanitize(itemId)}`
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "")
}
