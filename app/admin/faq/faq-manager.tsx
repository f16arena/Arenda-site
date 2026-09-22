"use client"

import { useMemo, useState } from "react"
import { EyeOff, Plus, RotateCcw, Save } from "lucide-react"
import { archiveFaqArticle, restoreDefaultFaqArticles, saveFaqArticle } from "@/app/actions/faq"
import { type FaqAudience } from "@/lib/faq"
import type { FaqArticleForAdmin } from "@/lib/faq-db"
import { useT } from "@/lib/i18n/client"
import { formatDateShortL } from "@/lib/i18n/format"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type FaqManagerProps = {
  articles: FaqArticleForAdmin[]
  audiences: FaqAudience[]
  defaultAudience: FaqAudience
  canManage: boolean
}

const NEW_ID = "__new__"

// Аудитория FAQ — это те же роли, что и в общем словаре: владелец,
// администратор, арендатор.
const AUDIENCE_ROLE = { owner: "OWNER", admin: "ADMIN", tenant: "TENANT" } as const

export function FaqManager({ articles, audiences, defaultAudience, canManage }: FaqManagerProps) {
  const { t } = useT()
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
    <Card className="block p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("adminService.faq.manager.title")}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("adminService.faq.manager.hint")}
          </p>
        </div>
        {canManage && (
          <form action={restoreDefaultFaqArticles}>
            <Button
              type="submit"
              variant="outline"
              leftIcon={<RotateCcw className="h-4 w-4" />}
            >
              {t("adminService.faq.manager.restore")}
            </Button>
          </form>
        )}
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
            {t(`domain.roles.${AUDIENCE_ROLE[audience]}`)}
          </button>
        ))}
        {canManage && (
          <button
            type="button"
            onClick={() => setSelectedId(NEW_ID)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            {t("adminService.faq.manager.newQuestion")}
          </button>
        )}
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
                    <Badge className="shrink-0 bg-slate-100 text-[10px] font-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {t("adminService.faq.manager.hidden")}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.category}</p>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t("adminService.faq.manager.noQuestions")}
            </div>
          )}
        </div>

        <FaqArticleForm key={formKey} article={selected} activeAudience={activeAudience} canManage={canManage} />
      </div>
    </Card>
  )
}

function FaqArticleForm({
  article,
  activeAudience,
  canManage,
}: {
  article?: FaqArticleForAdmin
  activeAudience: FaqAudience
  canManage: boolean
}) {
  const { t, locale } = useT()
  const isNew = !article

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <form action={saveFaqArticle} className="space-y-4">
        <input type="hidden" name="id" value={article?.id ?? ""} />

        <div className="grid gap-3 lg:grid-cols-[180px_1fr_120px]">
          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{t("adminService.faq.manager.audience")}</span>
            <select
              name="audience"
              defaultValue={article?.audience ?? activeAudience}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {(["owner", "admin", "tenant"] as FaqAudience[]).map((audience) => (
                <option key={audience} value={audience}>
                  {t(`domain.roles.${AUDIENCE_ROLE[audience]}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{t("adminService.faq.manager.category")}</span>
            <Input
              name="category"
              required
              defaultValue={article?.category ?? ""}
              placeholder={t("adminService.faq.manager.categoryPlaceholder")}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{t("adminService.faq.manager.order")}</span>
            <Input
              name="sortOrder"
              type="number"
              defaultValue={article?.sortOrder ?? 0}
            />
          </label>
        </div>

        <label className="space-y-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">{t("adminService.faq.manager.question")}</span>
          <Input
            name="question"
            required
            defaultValue={article?.question ?? ""}
            placeholder={t("adminService.faq.manager.questionPlaceholder")}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">{t("adminService.faq.manager.answer")}</span>
          <Textarea
            name="answer"
            required
            rows={4}
            defaultValue={article?.answer ?? ""}
            className="leading-6"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">{t("adminService.faq.manager.steps")}</span>
          <Textarea
            name="steps"
            rows={4}
            defaultValue={article?.steps?.join("\n") ?? ""}
            className="leading-6"
          />
        </label>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{t("adminService.faq.manager.tags")}</span>
            <Input
              name="tags"
              defaultValue={article?.tags?.join(", ") ?? ""}
              placeholder={t("adminService.faq.manager.tagsPlaceholder")}
            />
          </label>

          <label className="flex items-end gap-2 pb-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={article?.isActive ?? true}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t("adminService.faq.manager.showInFaq")}
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{t("adminService.faq.manager.href")}</span>
            <Input
              name="href"
              defaultValue={article?.href ?? ""}
              placeholder={t("adminService.faq.manager.hrefPlaceholder")}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{t("adminService.faq.manager.hrefLabel")}</span>
            <Input
              name="hrefLabel"
              defaultValue={article?.hrefLabel ?? ""}
              placeholder={t("adminService.faq.manager.hrefLabelPlaceholder")}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isNew
              ? t("adminService.faq.manager.newRecord")
              : t("adminService.faq.manager.updated", { date: formatDateShortL(locale, article.updatedAt) })}
          </p>
          {canManage && (
            <Button type="submit" leftIcon={<Save className="h-4 w-4" />}>
              {t("common.actions.save")}
            </Button>
          )}
        </div>
      </form>

      {!isNew && canManage && (
        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <ConfirmDialog
            variant="danger"
            title={t("adminService.faq.manager.hideTitle")}
            description={t("adminService.faq.manager.hideDescription")}
            confirmLabel={t("adminService.faq.manager.hideConfirm")}
            onConfirm={async () => {
              const formData = new FormData()
              formData.set("id", article.id)
              await archiveFaqArticle(formData)
            }}
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
              >
                <EyeOff className="h-4 w-4" />
                {t("adminService.faq.manager.hideButton")}
              </button>
            }
          />
        </div>
      )}
    </div>
  )
}
