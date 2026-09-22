"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, Archive, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/client"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import { buildVacancyFeedXml, setListingStatus, type ListingRow } from "@/app/actions/krisha-listing"

// Цвет бейджа статуса; подпись берётся из словаря.
const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  COPIED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  PUBLISHED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  ARCHIVED: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
}

export function ListingsTable({ rows }: { rows: ListingRow[] }) {
  const { t, tp, locale } = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const money = (v: number | null): string =>
    v && v > 0 ? `${formatMoneyL(locale, Math.round(v))}${t("common.money.perMonth")}` : "—"

  const statusLabel = (status: string): string => {
    if (status === "COPIED") return t("adminObjects.listings.statusCopied")
    if (status === "PUBLISHED") return t("adminObjects.listings.statusPublished")
    if (status === "ARCHIVED") return t("domain.statuses.ARCHIVED")
    return t("domain.statuses.DRAFT")
  }

  function downloadFeed() {
    startTransition(async () => {
      const res = await buildVacancyFeedXml()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const blob = new Blob([res.xml], { type: "application/xml" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "vacancies.xml"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(tp("adminObjects.listings.feedReady", res.count))
    })
  }

  function archive(id: string) {
    setBusyId(id)
    startTransition(async () => {
      const res = await setListingStatus(id, "ARCHIVED")
      setBusyId(null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(t("domain.statuses.ARCHIVED"))
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("adminObjects.listings.intro")}
        </p>
        <Button onClick={downloadFeed} disabled={pending} leftIcon={<Download className="h-4 w-4" />}>
          {t("adminObjects.listings.downloadFeed")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400 dark:border-slate-800">
          {t("adminObjects.listings.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-2 font-medium">{t("adminObjects.listings.thListing")}</th>
                <th className="px-4 py-2 font-medium">{t("adminObjects.listings.thSpace")}</th>
                <th className="px-4 py-2 font-medium">{t("adminObjects.listings.thPrice")}</th>
                <th className="px-4 py-2 font-medium">{t("adminObjects.listings.thStatus")}</th>
                <th className="px-4 py-2 font-medium">{t("adminObjects.listings.thUpdated")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/60">
                  <td className="max-w-[280px] truncate px-4 py-2 text-slate-800 dark:text-slate-200" title={r.title}>{r.title}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                    {r.buildingName ? `${r.buildingName} · ` : ""}{r.spaceNumber ? `№${r.spaceNumber}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{money(r.priceMonthly)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLASS[r.status] ?? STATUS_CLASS.DRAFT}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">{formatDateShortL(locale, r.updatedAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-3">
                      {r.externalUrl && (
                        <a href={r.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <ExternalLink className="h-3.5 w-3.5" /> {t("common.actions.open")}
                        </a>
                      )}
                      {r.status !== "ARCHIVED" && (
                        <button
                          type="button"
                          onClick={() => archive(r.id)}
                          disabled={pending && busyId === r.id}
                          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400"
                        >
                          <Archive className="h-3.5 w-3.5" /> {t("adminObjects.listings.archive")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
