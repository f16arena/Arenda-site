"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { BookOpen, ChevronRight, Search, X } from "lucide-react"
import type { FaqAudience, FaqItem } from "@/lib/faq"
import { faqAudienceLabels } from "@/lib/faq"

type FaqSearchProps = {
  items: FaqItem[]
  audiences: FaqAudience[]
  defaultAudience: FaqAudience
}

export function FaqSearch({ items, audiences, defaultAudience }: FaqSearchProps) {
  const [query, setQuery] = useState("")
  const [activeAudience, setActiveAudience] = useState<FaqAudience>(defaultAudience)
  const normalizedQuery = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (item.audience !== activeAudience) return false
      if (!normalizedQuery) return true

      const haystack = [
        item.category,
        item.question,
        item.answer,
        ...(item.steps ?? []),
        ...item.tags,
      ].join(" ").toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [activeAudience, items, normalizedQuery])

  const grouped = useMemo(() => {
    const map = new Map<string, FaqItem[]>()
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, [])
      map.get(item.category)!.push(item)
    }
    return Array.from(map.entries())
  }, [filtered])

  const activeTotal = items.filter((item) => item.audience === activeAudience).length

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по FAQ: пароль, подпись, счет, заявка..."
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/10"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Очистить поиск"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {audiences.length > 1 && (
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
              {audiences.map((audience) => (
                <button
                  key={audience}
                  type="button"
                  onClick={() => setActiveAudience(audience)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    activeAudience === audience
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  {faqAudienceLabels[audience]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Раздел: {faqAudienceLabels[activeAudience]}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Найдено: {filtered.length} из {activeTotal}
          </span>
        </div>
      </section>

      {grouped.length > 0 ? (
        <div className="space-y-4">
          {grouped.map(([category, categoryItems]) => (
            <section key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{category}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{categoryItems.length} вопросов</p>
                </div>
              </div>

              <div className="grid gap-3">
                {categoryItems.map((item) => (
                  <FaqCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Search className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Ничего не найдено</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Попробуйте другой запрос: договор, счет, подпись, пароль, заявка или счетчик.
          </p>
        </section>
      )}
    </div>
  )
}

function FaqCard({ item }: { item: FaqItem }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{item.question}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.answer}</p>
        </div>
        {item.href && item.hrefLabel && (
          <Link
            href={item.href}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {item.hrefLabel}
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {item.steps && item.steps.length > 0 && (
        <ol className="mt-4 grid gap-2">
          {item.steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm text-slate-600 dark:text-slate-300">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {item.tags.slice(0, 6).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            {tag}
          </span>
        ))}
      </div>
    </article>
  )
}
