import Link from "next/link"
import type { ReactNode } from "react"

type EmptyStateAction = {
  href: string
  label: string
  variant?: "primary" | "secondary"
}

export function EmptyState({
  icon,
  title,
  description,
  actions = [],
}: {
  icon?: ReactNode
  title: string
  description: string
  actions?: EmptyStateAction[]
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-8 text-center">
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={
                action.variant === "secondary"
                  ? "rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  : "rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              }
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
