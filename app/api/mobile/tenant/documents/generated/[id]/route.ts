import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileTenantRequest } from "@/lib/mobile-tenant"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { id } = await params
  const document = await db.generatedDocument.findFirst({
    where: {
      id,
      tenantId: result.tenant.id,
      organizationId: result.ctx.org.id,
    },
  })

  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const mime =
    document.format === "DOCX" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
    document.format === "XLSX" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :
    document.format === "PDF" ? "application/pdf" :
    "application/octet-stream"

  return new NextResponse(document.fileBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(document.fileSize),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
      "Cache-Control": "private, max-age=300",
    },
  })
}
