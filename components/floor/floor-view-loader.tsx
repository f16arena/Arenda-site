"use client"

import dynamic from "next/dynamic"
import type { FloorLayoutV2 } from "@/lib/floor-layout"
import type { SpaceInfo } from "./floor-view"

const FloorView = dynamic(() => import("./floor-view").then((mod) => mod.FloorView), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" />
  ),
})

export function FloorViewLoader({
  layout,
  spaces,
}: {
  layout: FloorLayoutV2
  spaces: SpaceInfo[]
}) {
  return <FloorView layout={layout} spaces={spaces} />
}
