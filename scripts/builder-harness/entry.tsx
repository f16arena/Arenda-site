import { createRoot } from "react-dom/client"
import { BuilderApp } from "@/components/builder/BuilderApp"
import { buildProjectFromBuilding } from "@/lib/builder/from-building"
import { parseDocument } from "@/types/builder"
import { useDocumentStore, useEditorStore, useSyncStore } from "@/store/builder-store"
import { useLabelStore } from "@/store/label-store"
import { floorRooms } from "@/lib/builder/rooms"
import { roomUse } from "@/lib/builder/room-use"
import { validateDocument } from "@/lib/builder/validate"
import { islandPolygon, islandSchedule } from "@/lib/builder/islands"
import { furnishFloor } from "@/lib/builder/furnish"
import { pointInPolygon } from "@/core/geometry/math"
import { DeleteIslandCommand, HideFurnishCommand, MoveIslandCommand, ResetFurnishCommand } from "@/core/document/commands"

const src = {
  id: "b1",
  name: "Стенд",
  floors: [1, 2].map((n) => ({
    id: `f${n}`, number: n, name: `${n} этаж`, kind: "FLOOR", totalArea: 600, layoutJson: null,
    spaces: [
      { id: `s${n}1`, number: `${n}01`, area: 120, kind: "RENTABLE" },
      { id: `s${n}2`, number: `${n}02`, area: 80, kind: "RENTABLE" },
      { id: `s${n}3`, number: `${n}03`, area: 60, kind: "RENTABLE" },
      { id: `s${n}4`, number: `${n}04`, area: 200, kind: "RENTABLE" },
    ],
  })),
}
const { doc } = buildProjectFromBuilding(src)
const w = window as unknown as Record<string, unknown>
w.__doc = () => useDocumentStore.getState().doc
w.__floorRooms = floorRooms
w.__roomUse = roomUse
w.__validate = validateDocument
w.__islandSchedule = (floors: Parameters<typeof islandSchedule>[0]) => islandSchedule(floors, (f) => floorRooms(f))
w.__commands = { DeleteIslandCommand, HideFurnishCommand, MoveIslandCommand, ResetFurnishCommand }
w.__islandPolygon = islandPolygon
w.__pointInPolygon = pointInPolygon
w.__furnishFloor = furnishFloor
w.__stores = { useDocumentStore, useEditorStore, useSyncStore, useLabelStore }
createRoot(document.getElementById("root")!).render(<BuilderApp initialDoc={parseDocument(doc)} buildingId="b1" />)
