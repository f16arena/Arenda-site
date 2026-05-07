import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { getSignatureDocumentPreview } from "@/lib/mobile-document-signatures"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const { id } = await params
  const requestRecord = await findAccessibleRequest(id, result.ctx.user.id, result.ctx.org.id)
  if (!requestRecord) return mobileError("Signature request not found", 404)

  const preview = await getSignatureDocumentPreview({
    orgId: result.ctx.org.id,
    documentType: requestRecord.documentType,
    documentId: requestRecord.documentId,
  })

  const documentPreview = preview && requestRecord.documentType !== "CONTRACT" && requestRecord.documentId
    ? { ...preview, downloadUrl: `/api/documents/archive/${requestRecord.documentId}` }
    : preview

  return NextResponse.json({
    data: {
      ...requestRecord,
      documentPreview,
      draftCapabilities: {
        smsOtp: "draft",
        ncaLayer: "available_for_web_or_future_native_bridge",
      },
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const { id } = await params
  const requestRecord = await findAccessibleRequest(id, result.ctx.user.id, result.ctx.org.id)
  if (!requestRecord) return mobileError("Signature request not found", 404)

  const body = await req.json().catch(() => null) as {
    action?: string
    reason?: string
  } | null

  const action = body?.action?.trim().toUpperCase()
  if (action === "VIEW") {
    const updated = await db.documentSignatureRequest.update({
      where: { id },
      data: {
        status: requestRecord.status === "PENDING" ? "VIEWED" : requestRecord.status,
        viewedAt: requestRecord.viewedAt ?? new Date(),
      },
      select: responseSelect,
    })
    return NextResponse.json({ data: updated })
  }

  if (action === "REJECT") {
    if (requestRecord.recipientUserId !== result.ctx.user.id) {
      return mobileError("Only recipient can reject a signature request", 403)
    }
    const reason = body?.reason?.trim().slice(0, 1000)
    if (!reason || reason.length < 5) return mobileError("Rejection reason is too short")

    const updated = await db.documentSignatureRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
      select: responseSelect,
    })
    return NextResponse.json({ data: updated })
  }

  if (action === "CANCEL") {
    if (requestRecord.requestedById !== result.ctx.user.id && !["OWNER", "ADMIN"].includes(result.ctx.user.role ?? "")) {
      return mobileError("Only requester, owner or admin can cancel a signature request", 403)
    }
    const updated = await db.documentSignatureRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
      select: responseSelect,
    })
    return NextResponse.json({ data: updated })
  }

  return mobileError("Unsupported action")
}

const responseSelect = {
  id: true,
  requestedById: true,
  recipientUserId: true,
  documentType: true,
  documentId: true,
  documentRef: true,
  title: true,
  message: true,
  status: true,
  channel: true,
  allowedMethods: true,
  preferredMethod: true,
  expiresAt: true,
  viewedAt: true,
  signedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  signatureId: true,
  smsPhoneMasked: true,
  createdAt: true,
  updatedAt: true,
} as const

async function findAccessibleRequest(id: string, userId: string, orgId: string) {
  return db.documentSignatureRequest.findFirst({
    where: {
      id,
      organizationId: orgId,
      OR: [
        { recipientUserId: userId },
        { requestedById: userId },
      ],
    },
    select: responseSelect,
  })
}
