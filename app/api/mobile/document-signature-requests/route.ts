import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { assertUserInOrg } from "@/lib/scope-guards"
import {
  assertDocumentCanBeSigned,
  createSignatureToken,
  maskPhone,
  normalizeSignatureMethods,
} from "@/lib/mobile-document-signatures"
import { notifyUser } from "@/lib/notify"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const now = new Date()
  const requests = await db.documentSignatureRequest.findMany({
    where: {
      recipientUserId: result.ctx.user.id,
      status: { in: ["PENDING", "VIEWED"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
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
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const contractLinks = result.ctx.user.role === "TENANT"
    ? await getTenantContractSignatureLinks(req, result.ctx.user.id, result.ctx.org.id)
    : []

  return NextResponse.json({
    data: [
      ...requests,
      ...contractLinks,
    ],
  })
}

export async function POST(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const role = result.ctx.user.role
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role ?? "")) {
    return mobileError("Only owner, admin or accountant can create signature requests", 403)
  }

  const body = await req.json().catch(() => null) as {
    recipientUserId?: string
    documentType?: string
    documentId?: string
    documentRef?: string
    title?: string
    message?: string
    allowedMethods?: unknown
    preferredMethod?: string
    expiresAt?: string
  } | null

  const recipientUserId = body?.recipientUserId?.trim()
  const documentType = body?.documentType?.trim().toUpperCase()
  const documentId = body?.documentId?.trim() || null
  const title = body?.title?.trim().slice(0, 180)
  const message = body?.message?.trim().slice(0, 1000) || null
  const allowedMethods = normalizeSignatureMethods(body?.allowedMethods)
  const preferredMethod = body?.preferredMethod?.trim().toUpperCase() || allowedMethods[0] || "NCA_LAYER"
  const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : null

  if (!recipientUserId) return mobileError("recipientUserId is required")
  if (!documentType) return mobileError("documentType is required")
  if (!title || title.length < 3) return mobileError("Title is too short")
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return mobileError("Invalid expiresAt")

  await assertUserInOrg(recipientUserId, result.ctx.org.id)
  await assertDocumentCanBeSigned({
    orgId: result.ctx.org.id,
    documentType,
    documentId,
  })

  const recipient = await db.user.findUnique({
    where: { id: recipientUserId },
    select: { phone: true },
  })

  const requestRecord = await db.documentSignatureRequest.create({
    data: {
      organizationId: result.ctx.org.id,
      requestedById: result.ctx.user.id,
      recipientUserId,
      documentType,
      documentId,
      documentRef: body?.documentRef?.trim().slice(0, 120) || null,
      title,
      message,
      channel: "MOBILE",
      allowedMethods,
      preferredMethod,
      signToken: createSignatureToken(),
      expiresAt,
      smsPhoneMasked: maskPhone(recipient?.phone),
    },
    select: {
      id: true,
      documentType: true,
      documentId: true,
      documentRef: true,
      title: true,
      message: true,
      status: true,
      allowedMethods: true,
      preferredMethod: true,
      expiresAt: true,
      createdAt: true,
    },
  })

  await notifyUser({
    userId: recipientUserId,
    type: "DOCUMENT_SIGNATURE_REQUEST",
    title: "Документ на подпись",
    message: title,
    link: "/cabinet/documents",
    sendEmail: true,
    sendTelegram: false,
    sendPush: true,
    pushData: {
      signatureRequestId: requestRecord.id,
      documentType,
    },
  })

  return NextResponse.json({ data: requestRecord }, { status: 201 })
}

async function getTenantContractSignatureLinks(req: Request, userId: string, orgId: string) {
  const origin = new URL(req.url).origin
  const contracts = await db.contract.findMany({
    where: {
      tenant: { userId, user: { organizationId: orgId } },
      signToken: { not: null },
      status: { in: ["SENT", "VIEWED", "SIGNED_BY_TENANT"] },
    },
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      signToken: true,
      sentAt: true,
      viewedAt: true,
      tenant: { select: { companyName: true } },
    },
    orderBy: { sentAt: "desc" },
    take: 20,
  })

  return contracts.map((contract) => ({
    id: `contract:${contract.id}`,
    documentType: "CONTRACT",
    documentId: contract.id,
    documentRef: contract.number,
    title: `${contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор"} № ${contract.number}`,
    message: contract.tenant.companyName,
    status: contract.status,
    channel: "WEB_SIGN_LINK",
    allowedMethods: ["SIMPLE_CONFIRMATION"],
    preferredMethod: "SIMPLE_CONFIRMATION",
    expiresAt: null,
    viewedAt: contract.viewedAt,
    createdAt: contract.sentAt,
    webUrl: `${origin}/sign/${contract.signToken}`,
  }))
}
