"use client"

import dynamic from "next/dynamic"
import type { RelationshipIntegrityOverview } from "@/lib/relationship-integrity"

const RelationshipIntegrityPanel = dynamic(
  () => import("./relationship-integrity-panel").then((m) => m.RelationshipIntegrityPanel),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
    ),
  },
)

export function RelationshipIntegrityPanelLazy({ overview }: { overview: RelationshipIntegrityOverview }) {
  return <RelationshipIntegrityPanel overview={overview} />
}
