import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"

export const dynamic = "force-dynamic"

// GET /api/templates/{type}
// Скачивает текущий активный шаблон документа (как файл) или его preview.
// Используется в UI: показать ссылку "скачать загруженный шаблон" /
// показать PDF-preview.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params
  const docType = type.toUpperCase() as "CONTRACT" | "INVOICE" | "ACT" | "RECONCILIATION"

  const { orgId } = await requireOrgAccess()
  const tpl = await db.documentTemplate.findFirst({
    where: { organizationId: orgId, documentType: docType, isActive: true },
    orderBy: { uploadedAt: "desc" },
  })
  if (!tpl) return NextResponse.json({ error: "No active template" }, { status: 404 })

  const mime =
    tpl.format === "DOCX" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
    tpl.format === "XLSX" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :
    tpl.format === "PDF"  ? "application/pdf" :
    "application/octet-stream"

  return new NextResponse(tpl.fileBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(tpl.fileName)}`,
    },
  })
}
