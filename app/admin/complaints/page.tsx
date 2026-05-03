export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { CheckCircle } from "lucide-react"
import { RespondButton } from "./complaint-actions"
import { requireOrgAccess } from "@/lib/org"
import { complaintScope } from "@/lib/tenant-scope"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/ui/empty-state"
import Link from "next/link"

const statusLabel: Record<string, string> = {
  NEW: "Новая",
  REVIEWED: "Рассмотрена",
  RESOLVED: "Решена",
}
const statusColor: Record<string, string> = {
  NEW: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
  REVIEWED: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",
  RESOLVED: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
}

const COMPLAINT_FILTERS = [
  { key: "all", label: "Все", statuses: null },
  { key: "new", label: "Новые", statuses: ["NEW"] },
  { key: "reviewed", label: "Рассмотрены", statuses: ["REVIEWED"] },
  { key: "resolved", label: "Решены", statuses: ["RESOLVED"] },
] as const

type ComplaintFilterKey = (typeof COMPLAINT_FILTERS)[number]["key"]

function normalizeFilter(value: string | string[] | undefined): ComplaintFilterKey {
  const raw = Array.isArray(value) ? value[0] : value
  return COMPLAINT_FILTERS.some((filter) => filter.key === raw) ? raw as ComplaintFilterKey : "all"
}

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string | string[] }>
}) {
  const { orgId } = await requireOrgAccess()
  const selectedFilter = normalizeFilter((await searchParams)?.status)
  const selectedFilterConfig = COMPLAINT_FILTERS.find((filter) => filter.key === selectedFilter) ?? COMPLAINT_FILTERS[0]

  const allComplaints = await db.complaint.findMany({
    where: complaintScope(orgId),
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, text: true, status: true, response: true, createdAt: true,
      user: { select: { name: true } },
    },
  }).catch(() => [])

  const selectedStatuses = selectedFilterConfig.statuses as readonly string[] | null
  const complaints = selectedStatuses
    ? allComplaints.filter((complaint) => selectedStatuses.includes(complaint.status))
    : allComplaints

  const filterCounts = COMPLAINT_FILTERS.reduce<Record<ComplaintFilterKey, number>>((acc, filter) => {
    const statuses = filter.statuses as readonly string[] | null
    acc[filter.key] = statuses
      ? allComplaints.filter((complaint) => statuses.includes(complaint.status)).length
      : allComplaints.length
    return acc
  }, { all: 0, new: 0, reviewed: 0, resolved: 0 })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Жалобы и предложения</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
          {filterCounts.new} новых · {filterCounts.reviewed} рассмотрено
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {COMPLAINT_FILTERS.map((filter) => {
          const active = selectedFilter === filter.key
          return (
            <Link
              key={filter.key}
              href={filter.key === "all" ? "/admin/complaints" : `/admin/complaints?status=${filter.key}`}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50",
              )}
            >
              {filter.label}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {filterCounts[filter.key]}
              </span>
            </Link>
          )
        })}
      </div>

      <div className="space-y-3">
        {complaints.map((c) => (
          <div key={c.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {c.user?.name ?? c.name ?? "Аноним"}
                  </p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[c.status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500"}`}>
                    {statusLabel[c.status] ?? c.status}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{c.text}</p>
                {c.response && (
                  <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 border-l-2 border-slate-300">
                    <span className="text-xs text-slate-400 dark:text-slate-500 block mb-1">Ответ администратора:</span>
                    {c.response}
                  </div>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  {new Date(c.createdAt).toLocaleDateString("ru-RU")}
                </p>
              </div>
              {c.status !== "RESOLVED" && (
                <RespondButton complaintId={c.id} hasResponse={!!c.response} />
              )}
            </div>
          </div>
        ))}

        {complaints.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-16 text-center">
            {allComplaints.length === 0 ? (
              <EmptyState
                icon={<CheckCircle className="h-5 w-5" />}
                title="Жалоб и предложений пока нет"
                description="Здесь появятся обращения арендаторов из кабинета. Отвечайте на них в системе, чтобы сохранялась история решения."
                actions={[
                  { href: "/admin/tenants", label: "Открыть арендаторов" },
                  { href: "/admin/faq", label: "FAQ для арендатора", variant: "secondary" },
                ]}
              />
            ) : (
              <EmptyState
                icon={<CheckCircle className="h-5 w-5" />}
                title="В этом фильтре обращений нет"
                description="Выберите другой статус или вернитесь ко всем жалобам и предложениям."
                actions={[
                  { href: "/admin/complaints", label: "Показать все" },
                ]}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
