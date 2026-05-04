"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"
import type { LeadKanban } from "./lead-kanban"

type LeadKanbanProps = ComponentProps<typeof LeadKanban>

const LeadKanbanChunk = dynamic(
  () => import("./lead-kanban").then((mod) => mod.LeadKanban),
  {
    ssr: false,
    loading: () => <LeadKanbanSkeleton />,
  },
)

export function LeadKanbanLoader(props: LeadKanbanProps) {
  return <LeadKanbanChunk {...props} />
}

function LeadKanbanSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-44 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="mt-2 h-4 w-52 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="min-h-[240px] rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="h-5 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="mt-5 space-y-2">
              <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
