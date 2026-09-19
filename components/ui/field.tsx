import * as React from "react"
import { cn } from "@/lib/utils"
import { FIELD_CLS, LABEL_CLS } from "@/lib/ui-fields"

/**
 * Системный выпадающий список в общем стиле. Системный (а не самодельный) —
 * работает в серверных формах без JS, на телефоне открывает родной выбор;
 * тёмная тема — через color-scheme в globals.css.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="native-select" className={cn(FIELD_CLS, "h-9 py-1.5", className)} {...props} />
}

/** Подпись + поле + подсказка/ошибка — одна раскладка для всех форм. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className={LABEL_CLS}>{label}</label>}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}
