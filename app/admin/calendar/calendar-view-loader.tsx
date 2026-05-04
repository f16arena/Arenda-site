"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"
import type { CalendarView } from "./calendar-view"

type CalendarViewProps = ComponentProps<typeof CalendarView>

const CalendarViewChunk = dynamic(
  () => import("./calendar-view").then((mod) => mod.CalendarView),
  {
    ssr: false,
    loading: () => <CalendarSkeleton />,
  },
)

export function CalendarViewLoader(props: CalendarViewProps) {
  return <CalendarViewChunk {...props} />
}

function CalendarSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="flex gap-2">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, index) => (
          <div key={index} className="min-h-24 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
            <div className="h-3 w-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="mt-3 h-3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  )
}
