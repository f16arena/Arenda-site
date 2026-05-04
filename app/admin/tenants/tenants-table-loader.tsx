"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"
import type { TenantsTable } from "./tenants-table"

type TenantsTableProps = ComponentProps<typeof TenantsTable>

const TenantsTableChunk = dynamic(
  () => import("./tenants-table").then((mod) => mod.TenantsTable),
  {
    ssr: false,
    loading: () => <TenantsTableSkeleton />,
  },
)

export function TenantsTableLoader(props: TenantsTableProps) {
  return <TenantsTableChunk {...props} />
}

function TenantsTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 max-w-sm flex-1 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1.3fr_0.7fr_1fr_0.6fr_0.8fr_0.8fr] gap-4 px-5 py-3">
              <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
