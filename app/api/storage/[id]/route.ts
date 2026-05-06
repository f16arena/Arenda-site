import { auth } from "@/auth"
import { db } from "@/lib/db"
import { readStoredFileBytes } from "@/lib/storage"
import { getAccessibleBuildingsForUser, isOwnerLike, isStaffScopedRole } from "@/lib/building-access"
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
      buildingId: true,
      tenantId: true,
      ownerType: true,
      ownerId: true,
      visibility: true,
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
  file: {
    id: string
    organizationId: string
    buildingId: string | null
    tenantId: string | null
    ownerType: string
    ownerId: string | null
    visibility: string
  },
  user: SessionUser,
) {
  if (user.isPlatformOwner) return true

  if (user.organizationId !== file.organizationId) return false
  if (isOwnerLike(user.role, user.isPlatformOwner)) return true

  if (user.role === "TENANT") {
    if (file.ownerType === "TENANT_DOCUMENT") {
      if (file.visibility !== "TENANT_VISIBLE") return false
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
      if (file.visibility !== "TENANT_VISIBLE") return false
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

    if (file.ownerType === "REQUEST_ATTACHMENT") {
      if (file.visibility !== "TENANT_VISIBLE") return false
      const request = await db.request.findFirst({
        where: {
          id: file.ownerId ?? "__none__",
          tenant: { userId: user.id },
        },
        select: { id: true },
      })
      return !!request
    }

    return false
  }

  if (!isStaffScopedRole(user.role)) return false
  const accessibleIds = new Set((await getAccessibleBuildingsForUser({
    userId: user.id,
    orgId: file.organizationId,
    role: user.role,
    isPlatformOwner: user.isPlatformOwner,
  })).map((building) => building.id))

  if (file.buildingId && accessibleIds.has(file.buildingId)) return true
  if (file.tenantId) {
    const tenant = await db.tenant.findFirst({
      where: { id: file.tenantId, user: { organizationId: file.organizationId } },
      select: {
        space: { select: { floor: { select: { buildingId: true } } } },
        tenantSpaces: { select: { space: { select: { floor: { select: { buildingId: true } } } } } },
        fullFloors: { select: { buildingId: true } },
      },
    })
    const ids = [
      tenant?.space?.floor.buildingId,
      ...(tenant?.tenantSpaces.map((item) => item.space.floor.buildingId) ?? []),
      ...(tenant?.fullFloors.map((floor) => floor.buildingId) ?? []),
    ].filter(Boolean) as string[]
    return ids.some((id) => accessibleIds.has(id))
  }

  return false
}
