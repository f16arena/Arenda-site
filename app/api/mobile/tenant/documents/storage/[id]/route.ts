import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileTenantRequest } from "@/lib/mobile-tenant"
import { readStoredFileBytes } from "@/lib/storage"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { id } = await params
  const file = await db.storedFile.findFirst({
    where: {
      id,
      organizationId: result.ctx.org.id,
      deletedAt: null,
      visibility: "TENANT_VISIBLE",
      OR: [
        { tenantId: result.tenant.id },
        { tenantDocument: { tenantId: result.tenant.id } },
        { paymentReports: { some: { tenantId: result.tenant.id } } },
      ],
    },
    select: {
      id: true,
      ownerType: true,
      ownerId: true,
      fileName: true,
      mimeType: true,
      compression: true,
      data: true,
    },
  })

  const requestAttachment = file ? null : await db.storedFile.findFirst({
    where: {
      id,
      organizationId: result.ctx.org.id,
      deletedAt: null,
      visibility: "TENANT_VISIBLE",
      ownerType: "REQUEST_ATTACHMENT",
      ownerId: {
        in: await db.request.findMany({
          where: { tenantId: result.tenant.id },
          select: { id: true },
        }).then((requests) => requests.map((request) => request.id)),
      },
    },
    select: {
      id: true,
      ownerType: true,
      ownerId: true,
      fileName: true,
      mimeType: true,
      compression: true,
      data: true,
    },
  })

  const storedFile = file ?? requestAttachment
  if (!storedFile) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const url = new URL(req.url)
  const dispositionType = url.searchParams.get("download") === "1" ? "attachment" : "inline"
  const bytes = readStoredFileBytes(storedFile)

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": storedFile.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${dispositionType}; filename*=UTF-8''${encodeURIComponent(storedFile.fileName)}`,
      "Cache-Control": "private, max-age=300",
    },
  })
}
