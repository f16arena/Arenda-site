import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { ElementType, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { TONE_CHIP, TONE_TEXT, TONE_BADGE, type Tone } from "@/lib/ui-tones"

/**
 * Централизованные строительные блоки админ-страниц. Собирай страницу из них —
 * единый стиль и одна точка правки. См. также lib/ui-tones.
 *
 *   <PageHeader icon={Gauge} title="Счётчики" subtitle="..." actions={<...>} />
 *   <StatGrid><StatCard .../></StatGrid>
 *   <Card title="Список" actions={<...>}> ... </Card>
 *   <Section title="..."> ... </Section>
 */

/** Шапка страницы: иконка в цветной плашке + заголовок/подзаголовок + действия справа. */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  tone = "blue",
  actions,
  backHref,
}: {
  title: string
  subtitle?: ReactNode
  icon?: ElementType
  tone?: Tone
  actions?: ReactNode
  backHref?: string
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Назад"
            className="text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        {Icon && (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONE_CHIP[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Белая панель-карточка. С опциональной шапкой (title/icon/actions). */
export function Card({
  title,
  icon: Icon,
  actions,
  children,
  padded = true,
  className,
}: {
  title?: ReactNode
  icon?: ElementType
  actions?: ReactNode
  children: ReactNode
  /** Внутренние отступы контента (выключить для таблиц/списков во всю ширину) */
  padded?: boolean
  className?: string
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {Icon && <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />}
            {title}
          </h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && "p-5")}>{children}</div>
    </section>
  )
}

/** Сетка карточек метрик. */
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const colsClass = cols === 2 ? "sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"
  return <div className={cn("grid grid-cols-2 gap-4", colsClass)}>{children}</div>
}

/** Карточка метрики: иконка + значение + подпись. Кликабельна, если задан href. */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "slate",
  href,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ElementType
  tone?: Tone
  href?: string
}) {
  const inner = (
    <>
      {Icon && (
        <div className={cn("mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg", TONE_CHIP[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <p className={cn("truncate text-2xl font-bold tabular-nums", TONE_TEXT[tone])}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      {sub && <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
    </>
  )
  const base = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
  if (href) {
    return (
      <Link href={href} className={cn(base, "transition hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40")}>
        {inner}
      </Link>
    )
  }
  return <div className={base}>{inner}</div>
}

/** Заголовок секции (без карточки-обёртки) + контент. */
export function Section({
  title,
  icon: Icon,
  actions,
  children,
}: {
  title: ReactNode
  icon?: ElementType
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          {Icon && <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </div>
  )
}

/** Бейдж-пилюля статуса. */
export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TONE_BADGE[tone])}>
      {children}
    </span>
  )
}
