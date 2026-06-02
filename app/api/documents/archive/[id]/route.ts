import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { isTenantRole } from "@/lib/role-capabilities"
import { convertDocxToPdf, pdfConvertConfigured } from "@/lib/pdf-convert"
import type { Prisma } from "@/app/generated/prisma/client"

export const dynamic = "force-dynamic"

// GET /api/documents/archive/{id}
// Скачать ранее сгенерированный документ из архива.
// Привязка к organization; арендатору — ТОЛЬКО его собственные документы
// (по tenantId), иначе тенант мог скачать документ соседнего арендатора.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const wantPdf = new URL(_req.url).searchParams.get("format") === "pdf"
  const session = await auth()
  const { orgId } = await requireOrgAccess()

  const where: Prisma.GeneratedDocumentWhereInput = { id, organizationId: orgId }
  if (session?.user && isTenantRole(session.user.role) && !session.user.isPlatformOwner) {
    const tenant = await db.tenant.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    where.tenantId = tenant?.id ?? "__none__"
  }

  const doc = await db.generatedDocument.findFirst({ where })
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // PDF по запросу: конвертируем хранимый DOCX → PDF (конвертер на VPS).
  // Если конвертер не настроен или ошибка — отдаём оригинальный DOCX (graceful).
  if (wantPdf && doc.format === "DOCX" && pdfConvertConfigured()) {
    try {
      const pdf = await convertDocxToPdf(Buffer.from(doc.fileBytes as unknown as Uint8Array), doc.fileName)
      const pdfName = doc.fileName.replace(/\.docx$/i, "") + ".pdf"
      return new NextResponse(pdf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(pdfName)}`,
        },
      })
    } catch { /* падаем в DOCX ниже */ }
  }

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
