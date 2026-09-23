"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Globe } from "lucide-react"
import { setLocale } from "@/app/actions/locale"
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT, type Locale } from "@/lib/i18n/config"
import { useLocale, useT } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

/**
 * Переключатель языка в шапке. Выглядит и ведёт себя как соседняя кнопка темы:
 * та же высота, та же подсветка, один клик — переключение. Языков два, поэтому
 * отдельное меню не нужно.
 *
 * На кнопке — текущий язык, а не тот, на который переключим: человек должен
 * видеть, где он находится. Что произойдёт по клику, написано в подсказке.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const current = useLocale()
  const { t } = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const next: Locale = LOCALES.find((l) => l !== current) ?? current

  const switchTo = () => {
    if (pending) return
    startTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      disabled={pending}
      title={`${t("common.language.label")}: ${LOCALE_NAMES[current]} → ${LOCALE_NAMES[next]}`}
      aria-label={`${t("common.language.label")}: ${LOCALE_NAMES[current]}`}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-slate-500 transition",
        "hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
        "active:scale-[0.97] disabled:opacity-60",
        className,
      )}
    >
      <Globe className="h-4 w-4 shrink-0" />
      <span className="text-[11px] font-semibold tracking-wide">{LOCALE_SHORT[current]}</span>
    </button>
  )
}
