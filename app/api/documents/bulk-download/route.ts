import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import PizZip from "pizzip"
import { safeServerValue } from "@/lib/server-fallback"

export const dynamic = "force-dynamic"

// POST /api/documents/bulk-download
// Body: { ids: string[] }
// Возвращает ZIP-архив с выбранными документами.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { orgId } = await requireOrgAccess()

  let body: { ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : []
  if (ids.length === 0) {
    return NextResponse.json({ error: "No documents selected" }, { status: 400 })
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: "Слишком много документов (максимум 100)" }, { status: 400 })
  }

  const docs = await safeServerValue(
    db.generatedDocument.findMany({
      where: { id: { in: ids }, organizationId: orgId },
      select: {
        id: true, fileName: true, fileBytes: true,
        documentType: true, period: true, tenantName: true,
      },
    }),
    [],
    {
      source: "api.documents.bulkDownload.documents",
      route: "/api/documents/bulk-download",
      orgId,
      userId: session.user.id,
      extra: { requestedCount: ids.length },
    },
  )

  if (docs.length === 0) {
    return NextResponse.json({ error: "Документы не найдены" }, { status: 404 })
  }

  // Собираем ZIP
  const zip = new PizZip()

  // Группируем имена чтобы избежать коллизий
  const seenNames = new Set<string>()
  for (const doc of docs) {
    let name = doc.fileName || `${doc.documentType}_${doc.id}.docx`
    // Префикс: тип_контрагент чтобы было понятно при распаковке
    const safeTenant = doc.tenantName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)
    name = `${safeTenant}/${name}`
    let unique = name
    let i = 1
    while (seenNames.has(unique)) {
      const dotIdx = name.lastIndexOf(".")
      unique = dotIdx > 0
        ? `${name.slice(0, dotIdx)}_${i}${name.slice(dotIdx)}`
        : `${name}_${i}`
      i++
    }
    seenNames.add(unique)
    zip.file(unique, doc.fileBytes as Buffer)
  }

  const buffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" })

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const archiveName = `documents_${dateStr}_${docs.length}.zip`

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${archiveName}"`,
      "Content-Length": String(buffer.length),
    },
  })
}
