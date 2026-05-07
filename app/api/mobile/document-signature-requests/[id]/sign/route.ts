import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const { id } = await params
  const requestRecord = await db.documentSignatureRequest.findFirst({
    where: {
      id,
      organizationId: result.ctx.org.id,
      recipientUserId: result.ctx.user.id,
      status: { in: ["PENDING", "VIEWED"] },
    },
    select: {
      id: true,
      documentType: true,
      documentId: true,
      documentRef: true,
      title: true,
      allowedMethods: true,
      expiresAt: true,
    },
  })
  if (!requestRecord) return mobileError("Signature request not found", 404)
  if (requestRecord.expiresAt && requestRecord.expiresAt < new Date()) {
    return mobileError("Signature request expired", 410)
  }

  const body = await req.json().catch(() => null) as {
    method?: string
    signedHashB64?: string
    signatureB64?: string
    certPemB64?: string
    signerName?: string
  } | null

  const method = body?.method?.trim().toUpperCase()
  const allowedMethods = Array.isArray(requestRecord.allowedMethods)
    ? requestRecord.allowedMethods
    : []

  if (method === "SMS_OTP" || method === "SMS_OTP_DRAFT") {
    return NextResponse.json({
      ok: false,
      draftOnly: true,
      method: "SMS_OTP_DRAFT",
      message: "SMS signing is reserved in the API contract, but OTP delivery and legal verification are not enabled yet.",
    }, { status: 202 })
  }

  if (method !== "NCA_LAYER") return mobileError("Unsupported signing method")
  if (allowedMethods.length > 0 && !allowedMethods.includes("NCA_LAYER")) {
    return mobileError("NCA_LAYER is not allowed for this request", 403)
  }

  const signedHashB64 = body?.signedHashB64?.trim()
  const signatureB64 = body?.signatureB64?.trim()
  const certPemB64 = body?.certPemB64?.trim()
  if (!signedHashB64 || !signatureB64 || !certPemB64) {
    return mobileError("signedHashB64, signatureB64 and certPemB64 are required")
  }

  const signature = await db.documentSignature.create({
    data: {
      organizationId: result.ctx.org.id,
      documentType: requestRecord.documentType,
      documentId: requestRecord.documentId,
      documentRef: requestRecord.documentRef,
      signerUserId: result.ctx.user.id,
      signerName: body?.signerName?.trim().slice(0, 200) || result.ctx.user.name || "Mobile signer",
      signedHashB64,
      signatureB64,
      certPemB64,
    },
    select: { id: true, signedAt: true },
  })

  const updated = await db.documentSignatureRequest.update({
    where: { id: requestRecord.id },
    data: {
      status: "SIGNED",
      signedAt: signature.signedAt,
      signatureId: signature.id,
    },
    select: {
      id: true,
      documentType: true,
      documentId: true,
      title: true,
      status: true,
      signedAt: true,
      signatureId: true,
    },
  })

  return NextResponse.json({
    data: updated,
    note: "Signature is stored. Contract lifecycle updates remain in the existing contract workflow until native legal signing is finalized.",
  })
}
