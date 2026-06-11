"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import type { FloorLayoutV2 } from "@/lib/floor-layout"
import type { SpaceInfo } from "@/components/floor/floor-view"
import type { BuildingFloor3D } from "./building-3d"

// three.js тяжёлый — грузим только в браузере
const Building3D = dynamic(() => import("./building-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ),
})

type ApiPayload = {
  building: { id: string; name: string; address: string }
  floors: Array<{
    id: string
    name: string
    number: number
    kind: string
    ratePerSqm: number
    layout: FloorLayoutV2 | null
    spaces: Array<Omit<SpaceInfo, "tenant"> & {
      tenant?: { id: string; companyName: string; debt: number; contractEnd: string | null } | null
    }>
  }>
}

type State =
  | { loading: true; error: null; data: null }
  | { loading: false; error: string; data: null }
  | { loading: false; error: null; data: { buildingName: string; floors: BuildingFloor3D[] } }

export function Building3DLoader({ buildingId }: { buildingId: string }) {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null })

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/admin/buildings/${buildingId}/3d`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Не удалось загрузить 3D-модель здания")
        return res.json()
      })
      .then((payload: ApiPayload) => {
        const floors: BuildingFloor3D[] = payload.floors.map((floor) => ({
          ...floor,
          spaces: floor.spaces.map((space) => ({
            ...space,
            tenant: space.tenant
              ? {
                  ...space.tenant,
                  contractEnd: space.tenant.contractEnd ? new Date(space.tenant.contractEnd) : null,
                }
              : null,
          })),
        }))
        setState({ loading: false, error: null, data: { buildingName: payload.building.name, floors } })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Не удалось загрузить 3D-модель здания",
          data: null,
        })
      })
    return () => controller.abort()
  }, [buildingId])

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
        <Loader2 className="h-5 w-5 animate-spin" /> Строим здание…
      </div>
    )
  }

  if (state.data === null) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        {state.error ?? "Не удалось загрузить 3D-модель здания"}
      </div>
    )
  }

  return <Building3D buildingName={state.data.buildingName} floors={state.data.floors} />
}
