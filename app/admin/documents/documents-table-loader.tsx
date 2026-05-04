"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"
import type { DocumentsTable } from "./documents-table"

type DocumentsTableProps = ComponentProps<typeof DocumentsTable>

const DocumentsTableChunk = dynamic(
  () => import("./documents-table").then((mod) => mod.DocumentsTable),
  {
    ssr: false,
    loading: () => <DocumentsTableSkeleton />,
  },
)

export function DocumentsTableLoader(props: DocumentsTableProps) {
  return <DocumentsTableChunk {...props} />
}

function DocumentsTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr] gap-4 px-5 py-3">
            <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  )
}
