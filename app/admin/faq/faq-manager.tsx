"use client"

import { useMemo, useState } from "react"
import { EyeOff, Plus, RotateCcw, Save } from "lucide-react"
import { archiveFaqArticle, restoreDefaultFaqArticles, saveFaqArticle } from "@/app/actions/faq"
import { faqAudienceLabels, type FaqAudience } from "@/lib/faq"
import type { FaqArticleForAdmin } from "@/lib/faq-db"

type FaqManagerProps = {
  articles: FaqArticleForAdmin[]
  audiences: FaqAudience[]
  defaultAudience: FaqAudience
}

const NEW_ID = "__new__"

export function FaqManager({ articles, audiences, defaultAudience }: FaqManagerProps) {
  const [activeAudience, setActiveAudience] = useState<FaqAudience>(defaultAudience)
  const [selectedId, setSelectedId] = useState(articles.find((item) => item.audience === defaultAudience)?.id ?? NEW_ID)

  const filtered = useMemo(
    () => articles.filter((item) => item.audience === activeAudience),
    [activeAudience, articles]
  )
  const selectedCandidate = articles.find((item) => item.id === selectedId)
  const selected = selectedCandidate?.audience === activeAudience ? selectedCandidate : undefined

  const formKey = selected?.id ?? `${NEW_ID}-${activeAudience}`

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Управление FAQ</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Вопросы хранятся в базе данных этой организации. Изменения сразу видны в FAQ владельца, администратора и арендатора.
          </p>
        </div>
        <form action={restoreDefaultFaqArticles}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            Вернуть базовые вопросы
          </button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {audiences.map((audience) => (
          <button
            key={audience}
            type="button"
            onClick={() => {
              setActiveAudience(audience)
              setSelectedId(articles.find((item) => item.audience === audience)?.id ?? NEW_ID)
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeAudience === audience
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {faqAudienceLabels[audience]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelectedId(NEW_ID)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Новый вопрос
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="max-h-[620px] space-y-2 overflow-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800">
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selectedId === item.id
                    ? "border-blue-300 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-500/10"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">{item.question}</p>
                  {!item.isActive && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      скрыт
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.category}</p>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Пока нет вопросов для этой аудитории.
            </div>
          )}
        </div>

        <FaqArticleForm key={formKey} article={selected} activeAudience={activeAudience} />
      </div>
    </section>
  )
}

function FaqArticleForm({
  article,
  activeAudience,
}: {
  article?: FaqArticleForAdmin
  activeAudience: FaqAudience
}) {
  const isNew = !article

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <form action={saveFaqArticle} className="space-y-4">
        <input type="hidden" name="id" value={article?.id ?? ""} />

        <div className="grid gap-3 lg:grid-cols-[180px_1fr_120px]">
          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Аудитория</span>
            <select
              name="audience"
              defaultValue={article?.audience ?? activeAudience}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {(["owner", "admin", "tenant"] as FaqAudience[]).map((audience) => (
                <option key={audience} value={audience}>
                  {faqAudienceLabels[audience]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Раздел</span>
            <input
              name="category"
              required
              defaultValue={article?.category ?? ""}
              placeholder="Например: Финансы"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Порядок</span>
            <input
              name="sortOrder"
              type="number"
              defaultValue={article?.sortOrder ?? 0}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
        </div>

        <label className="space-y-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Вопрос</span>
          <input
            name="question"
            required
            defaultValue={article?.question ?? ""}
            placeholder="Как арендатору отправить чек об оплате?"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Ответ</span>
          <textarea
            name="answer"
            required
            rows={4}
            defaultValue={article?.answer ?? ""}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Шаги, каждый с новой строки</span>
          <textarea
            name="steps"
            rows={4}
            defaultValue={article?.steps?.join("\n") ?? ""}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Теги через запятую</span>
            <input
              name="tags"
              defaultValue={article?.tags?.join(", ") ?? ""}
              placeholder="оплата, договор, пароль"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <label className="flex items-end gap-2 pb-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={article?.isActive ?? true}
              className="h-4 w-4 rounded border-slate-300"
            />
            Показывать в FAQ
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Ссылка</span>
            <input
              name="href"
              defaultValue={article?.href ?? ""}
              placeholder="/admin/finances"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Текст ссылки</span>
            <input
              name="hrefLabel"
              defaultValue={article?.hrefLabel ?? ""}
              placeholder="Открыть финансы"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isNew ? "Новая запись будет сохранена в БД." : `Обновлено: ${new Date(article.updatedAt).toLocaleString("ru-RU")}`}
          </p>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <Save className="h-4 w-4" />
            Сохранить
          </button>
        </div>
      </form>

      {!isNew && (
        <form
          action={archiveFaqArticle}
          onSubmit={(event) => {
            if (!confirm("Скрыть этот вопрос из FAQ? Его можно будет снова включить галочкой.")) {
              event.preventDefault()
            }
          }}
          className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800"
        >
          <input type="hidden" name="id" value={article.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            <EyeOff className="h-4 w-4" />
            Скрыть вопрос
          </button>
        </form>
      )}
    </div>
  )
}
