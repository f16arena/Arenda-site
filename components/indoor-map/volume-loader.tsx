"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import type { RoomView } from "@/lib/indoor-map/model"
import type { VolumeFloor } from "./volume-view"

// three.js весит много и нужен только в объёмном режиме — грузим по требованию
// и только в браузере, чтобы он не попал в общий бандл админки.
const VolumeView = dynamic(() => import("./volume-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
      <Loader2 className="h-5 w-5 animate-spin" /> Собираем объём…
    </div>
  ),
})

export function VolumeLoader(props: {
  floors: VolumeFloor[]
  activeFloorId: string | null
  onPickFloor: (floorId: string) => void
  onPickRoom: (floorId: string, room: RoomView) => void
}) {
  return <VolumeView {...props} />
}
