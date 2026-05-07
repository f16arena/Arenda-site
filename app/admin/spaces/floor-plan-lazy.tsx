"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { FloorViewLoader } from "@/components/floor/floor-view-loader"
import type { SpaceInfo } from "@/components/floor/floor-view"
import type { FloorLayoutV2 } from "@/lib/floor-layout"

type FloorPlanPayload = {
  layout: FloorLayoutV2 | null
  spaces: Array<Omit<SpaceInfo, "tenant"> & {
    tenant?: {
      id: string
      companyName: string
      debt: number
      contractEnd: string | null
    } | null
  }>
}

type State =
  | { loading: true; error: null; data: null }
  | { loading: false; error: string; data: null }
  | { loading: false; error: null; data: FloorPlanPayload }

export function FloorPlanLazy({ floorId }: { floorId: string }) {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null })

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/admin/floors/${floorId}/layout`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить план этажа")
        return response.json()
      })
      .then((data: FloorPlanPayload) => {
        setState({ loading: false, error: null, data })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Не удалось загрузить план этажа",
          data: null,
        })
      })

    return () => controller.abort()
  }, [floorId])

  if (state.loading) {
    return (
      <div className="h-[260px] animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" />
    )
  }

  if (state.error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        {state.error}. Таблица помещений доступна ниже.
      </div>
    )
  }

  if (!state.data?.layout) {
    return <EmptyFloorPlan floorId={floorId} />
  }

  const spaces: SpaceInfo[] = state.data.spaces.map((space) => ({
    ...space,
    tenant: space.tenant
      ? {
          ...space.tenant,
          contractEnd: space.tenant.contractEnd ? new Date(space.tenant.contractEnd) : null,
        }
      : null,
  }))

  return <FloorViewLoader layout={state.data.layout} spaces={spaces} />
}

function EmptyFloorPlan({ floorId }: { floorId: string }) {
  return (
    <div className="relative rounded-lg border-2 border-dashed border-purple-200 bg-purple-50/30 p-4 text-center dark:border-purple-500/30 dark:bg-purple-500/5">
      <div className="mb-1 inline-flex items-center gap-1.5 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
        BETA
      </div>
      <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Визуализация помещения не настроена</p>
      <Link
        href={`/admin/floors/${floorId}/visualization`}
        className="inline-flex items-center gap-2 text-xs text-purple-600 hover:underline dark:text-purple-400"
      >
        Загрузить PDF плана →
      </Link>
    </div>
  )
}
