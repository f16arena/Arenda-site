import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { parseSpacePhotos } from "@/lib/space-photos"

export const dynamic = "force-dynamic"

// Публичная отдача фото помещения для внешних площадок (krisha XML-фид и т.п.).
// Без авторизации — но ТОЛЬКО для свободных арендопригодных помещений (как в фиде вакансий).
// id помещения — cuid (неугадываемый); статус-гейт ограничивает выдачу вакансиями.
export async function GET(_req: Request, { params }: { params: Promise<{ spaceId: string; idx: string }> }) {
  const { spaceId, idx } = await params
  const i = Number.parseInt(idx, 10)
  if (!Number.isInteger(i) || i < 0) return NextResponse.json({ error: "Bad index" }, { status: 400 })

  const space = await db.space.findFirst({
    where: { id: spaceId, status: "VACANT", kind: "RENTABLE" },
    select: { photos: true },
  })
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const photos = parseSpacePhotos(space.photos)
  const dataUrl = photos[i]
  if (!dataUrl) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl)
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const bytes = Buffer.from(m[2], "base64")

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=3600",
    },
  })
}
