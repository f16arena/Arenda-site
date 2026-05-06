"use client"

import dynamic from "next/dynamic"
import type { FloorLayoutV2 } from "@/lib/floor-layout"

type SpaceLite = { id: string; number: string; status: string }

type FloorEditorProps = {
  floorId: string
  floorName: string
  floorNumber: number
  f16Template?: FloorLayoutV2 | null
  initialLayout: FloorLayoutV2 | null
  initialTotalArea?: number | null
  spaces: SpaceLite[]
}

const FloorEditor = dynamic(
  () => import("./floor-editor").then((mod) => mod.FloorEditor),
  {
    ssr: false,
    loading: () => <FloorEditorSkeleton />,
  },
)

export function FloorEditorLoader(props: FloorEditorProps) {
  return <FloorEditor {...props} />
}

function FloorEditorSkeleton() {
  return (
    <div className="min-h-[620px] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4 dark:border-slate-800">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="flex gap-2">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
      <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800 lg:border-b-0 lg:border-r">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
        <div className="p-4">
          <div className="h-full min-h-[520px] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  )
}
