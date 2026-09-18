"use client"

// Подсказка в режиме обхода: в каком помещении человек сейчас стоит. На показе
// арендатору это первый вопрос — «а это какая комната и сколько тут метров».

import { useEffect, useState } from "react"
import type { BuilderEngine } from "@/engine/engine"
import { useDocumentStore } from "@/store/builder-store"
import { usePremiseStore } from "@/store/premise-store"
import { pointInPolygon } from "@/core/geometry/math"
import { floorRooms } from "@/lib/builder/rooms"
import { roomDisplayName, roomUse } from "@/lib/builder/room-use"
import { TOKENS, STATUS_LABEL, STATUS_COLOR, type PremiseStatus } from "@/lib/builder/materials"

interface Spot {
  name: string
  areaM2: number
  status?: PremiseStatus
  tenant?: string
}

export function WalkRoomBadge({ getEngine }: { getEngine: () => BuilderEngine | null }) {
  const [spot, setSpot] = useState<Spot | null>(null)
  const doc = useDocumentStore((s) => s.doc)

  useEffect(() => {
    // раз в полсекунды: чаще не нужно, а расчёт помещений не бесплатный
    const timer = setInterval(() => {
      const at = getEngine()?.getWalkSpot()
      if (!at) {
        setSpot(null)
        return
      }
      const floor = doc.buildings.flatMap((b) => b.floors).find((f) => f.id === at.floorId)
      if (!floor) {
        setSpot(null)
        return
      }
      const rooms = floorRooms(floor)
      const room = rooms.find((r) => pointInPolygon(at.at, r.polygon) && !(r.holes ?? []).some((h) => pointInPolygon(at.at, h)))
      if (!room) {
        setSpot(null)
        return
      }
      const premiseId = floor.premiseLinks?.[room.id]
      const premise = premiseId ? usePremiseStore.getState().resolve(premiseId) : undefined
      const base = roomDisplayName(floor, room) || (roomUse(floor, room) === "common" ? "МОП" : "Помещение")
      setSpot({
        name: premise?.number ? `${base} ${premise.number}` : base,
        areaM2: room.areaMm2 / 1e6,
        status: premise?.status,
        tenant: premise?.tenantName ?? undefined,
      })
    }, 500)
    return () => clearInterval(timer)
  }, [getEngine, doc])

  if (!spot) return null
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl px-3 py-1.5 text-xs shadow-xl backdrop-blur-xl"
      style={{ background: "rgba(15,23,42,0.75)", border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.text }}
    >
      <b>{spot.name}</b>
      <span className="tabular-nums" style={{ color: TOKENS.muted }}>
        {spot.areaM2.toFixed(1).replace(".", ",")} м²
      </span>
      {spot.status && (
        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: STATUS_COLOR[spot.status], color: "#0b1220" }}>
          {STATUS_LABEL[spot.status]}
        </span>
      )}
      {spot.tenant && <span style={{ color: TOKENS.muted }}>{spot.tenant}</span>}
    </div>
  )
}
