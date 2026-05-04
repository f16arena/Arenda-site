import { auth } from "@/auth"
import { db } from "@/lib/db"
import { readStoredFileBytes } from "@/lib/storage"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type SessionUser = {
  id: string
  role?: string | null
  organizationId?: string | null
  isPlatformOwner?: boolean | null
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const file = await db.storedFile.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      organizationId: true,
      ownerType: true,
      fileName: true,
      mimeType: true,
      compression: true,
      data: true,
    },
  })
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const allowed = await canAccessStoredFile(file, session.user)
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const url = new URL(req.url)
  const dispositionType = url.searchParams.get("download") === "1" ? "attachment" : "inline"
  const bytes = readStoredFileBytes(file)

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${dispositionType}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, max-age=300",
    },
  })
}

async function canAccessStoredFile(
  file: { id: string; organizationId: string; ownerType: string },
  user: SessionUser,
) {
  if (user.isPlatformOwner) return true

  if (user.organizationId !== file.organizationId) return false
  if (user.role !== "TENANT") return true

  if (file.ownerType === "TENANT_DOCUMENT") {
    const doc = await db.tenantDocument.findFirst({
      where: {
        storageFileId: file.id,
        tenant: { userId: user.id },
      },
      select: { id: true },
    })
    return !!doc
  }

  if (file.ownerType === "PAYMENT_RECEIPT") {
    const report = await db.paymentReport.findFirst({
      where: {
        receiptFileId: file.id,
        OR: [
          { userId: user.id },
          { tenant: { userId: user.id } },
        ],
      },
      select: { id: true },
    })
    return !!report
  }

  return false
}
