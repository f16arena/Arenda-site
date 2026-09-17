import { createRoot } from "react-dom/client"
import { BuilderApp } from "@/components/builder/BuilderApp"
import { buildProjectFromBuilding } from "@/lib/builder/from-building"
import { parseDocument } from "@/types/builder"
import { useDocumentStore, useEditorStore, useSyncStore } from "@/store/builder-store"
import { useLabelStore } from "@/store/label-store"

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
w.__stores = { useDocumentStore, useEditorStore, useSyncStore, useLabelStore }
createRoot(document.getElementById("root")!).render(<BuilderApp initialDoc={parseDocument(doc)} buildingId="b1" />)
