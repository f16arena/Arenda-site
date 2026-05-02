"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { setBuildingAreaFromFloors } from "@/app/actions/floor-layout"

export function ApplyAreaButton({
  buildingId,
  proposed,
  current,
}: {
  buildingId: string
  proposed: number
  current: number | null
}) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  if (done) return null

  return (
    <button
      onClick={() => {
        if (current && current >= proposed) return
        startTransition(async () => {
          try {
            const r = await setBuildingAreaFromFloors(buildingId)
            toast.success(`Площадь здания установлена: ${r.totalArea} м²`)
            setDone(true)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Не удалось обновить здание")
          }
        })
      }}
      disabled={pending}
      className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-500/30 disabled:opacity-50 transition-colors"
    >
      {pending ? "Обновление..." : `Применить → ${proposed.toFixed(0)} м²`}
    </button>
  )
}
