"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"
import type { BalanceClient } from "./balance-client"

type BalanceClientProps = ComponentProps<typeof BalanceClient>

const BalanceClientChunk = dynamic(
  () => import("./balance-client").then((mod) => mod.BalanceClient),
  {
    ssr: false,
    loading: () => <BalanceSkeleton />,
  },
)

export function BalanceClientLoader(props: BalanceClientProps) {
  return <BalanceClientChunk {...props} />
}

function BalanceSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <div className="h-10 w-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="h-6 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="mt-4 h-8 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="mt-5 space-y-2">
              <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
