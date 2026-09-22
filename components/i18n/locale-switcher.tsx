"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { setLocale } from "@/app/actions/locale"
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT, type Locale } from "@/lib/i18n/config"
import { useLocale, useT } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

/**
 * RU | ҚАЗ в шапке. Название языка — на самом этом языке («Қазақша», а не
 * «Казахский»): человек, который не читает по-русски, должен узнать свой язык.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const current = useLocale()
  const { t } = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const choose = (locale: Locale) => {
    if (locale === current || pending) return
    startTransition(async () => {
      await setLocale(locale)
      router.refresh()
    })
  }

  return (
    <div
      role="group"
      aria-label={t("common.language.label")}
      className={cn(
        "inline-flex items-center rounded-lg border border-slate-200 p-0.5 dark:border-slate-800",
        pending && "opacity-60",
        className,
      )}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          title={LOCALE_NAMES[locale]}
          aria-pressed={locale === current}
          onClick={() => choose(locale)}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-semibold transition",
            locale === current
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
          )}
        >
          {LOCALE_SHORT[locale]}
        </button>
      ))}
    </div>
  )
}
