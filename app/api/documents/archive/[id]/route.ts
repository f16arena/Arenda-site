import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"

export const dynamic = "force-dynamic"

// GET /api/documents/archive/{id}
// Скачать ранее сгенерированный документ из архива (привязка к organization).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { orgId } = await requireOrgAccess()

  const doc = await db.generatedDocument.findFirst({
    where: { id, organizationId: orgId },
  })
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const mime =
    doc.format === "DOCX" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
    doc.format === "XLSX" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :
    doc.format === "PDF"  ? "application/pdf" :
    "application/octet-stream"

  return new NextResponse(doc.fileBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    },
  })
}
