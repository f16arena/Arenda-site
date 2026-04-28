import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { FloorEditor } from "./floor-editor"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default async function FloorEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const { id } = await params

  const floor = await db.floor.findUnique({
    where: { id },
    include: {
      spaces: { orderBy: { number: "asc" } },
    },
  })

  if (!floor) notFound()

  let initialLayout = null
  if (floor.layoutJson) {
    try {
      initialLayout = JSON.parse(floor.layoutJson)
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/spaces" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          К помещениям
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-semibold text-slate-900">Редактор плана: {floor.name}</h1>
      </div>

      <FloorEditor
        floorId={floor.id}
        floorName={floor.name}
        initialLayout={initialLayout}
        spaces={floor.spaces.map((s) => ({
          id: s.id,
          number: s.number,
          status: s.status,
        }))}
      />
    </div>
  )
}
