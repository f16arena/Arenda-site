import { ChevronDown } from "lucide-react"
import type { ElementType, ReactNode } from "react"

type Props = {
  title: string
  icon?: ElementType
  children: ReactNode
  defaultOpen?: boolean
  meta?: ReactNode
  compact?: boolean
}

export function CollapsibleCard({ title, icon: Icon, children, defaultOpen = false, meta, compact = false }: Props) {
  return (
    <details
      open={defaultOpen}
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 border-b border-transparent bg-slate-50 px-5 py-3.5 transition-colors hover:bg-slate-100 group-open:border-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 dark:group-open:border-slate-800 [&::-webkit-details-marker]:hidden">
        {Icon && <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />}
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        {meta && <span className="ml-auto truncate text-xs font-normal text-slate-400 dark:text-slate-500">{meta}</span>}
        <ChevronDown className="ml-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500" />
      </summary>
      <div className={compact ? "" : "group-open:border-t group-open:border-slate-100 dark:group-open:border-slate-800"}>
        {children}
      </div>
    </details>
  )
}
