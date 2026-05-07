import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileTenantRequest } from "@/lib/mobile-tenant"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  const origin = new URL(req.url).origin
  const now = new Date()

  const [generated, tenantDocuments, signatureRequests, contracts] = await Promise.all([
    db.generatedDocument.findMany({
      where: { tenantId: tenant.id, organizationId: ctx.org.id },
      select: {
        id: true,
        documentType: true,
        number: true,
        period: true,
        totalAmount: true,
        fileName: true,
        fileSize: true,
        format: true,
        generatedAt: true,
      },
      orderBy: { generatedAt: "desc" },
      take: 50,
    }),
    db.tenantDocument.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        type: true,
        name: true,
        fileUrl: true,
        storageFileId: true,
        createdAt: true,
        storageFile: {
          select: { fileName: true, mimeType: true, originalSize: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.documentSignatureRequest.findMany({
      where: {
        recipientUserId: ctx.user.id,
        organizationId: ctx.org.id,
        status: { in: ["PENDING", "VIEWED", "SIGNED", "REJECTED"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }, { status: { in: ["SIGNED", "REJECTED"] } }],
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
        signedAt: true,
        rejectedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.contract.findMany({
      where: {
        tenantId: tenant.id,
        signToken: { not: null },
        status: { in: ["SENT", "VIEWED", "SIGNED_BY_TENANT", "SIGNED", "REJECTED"] },
      },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        signToken: true,
        sentAt: true,
        viewedAt: true,
        signedByTenantAt: true,
        signedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ])

  return NextResponse.json({
    generated: generated.map((document) => ({
      ...document,
      source: "generated",
      downloadUrl: `${origin}/api/mobile/tenant/documents/generated/${document.id}`,
    })),
    tenantDocuments: tenantDocuments.map((document) => ({
      ...document,
      source: "tenant_document",
      fileName: document.storageFile?.fileName ?? document.name,
      mimeType: document.storageFile?.mimeType ?? null,
      fileSize: document.storageFile?.originalSize ?? null,
      downloadUrl: document.storageFileId
        ? `${origin}/api/mobile/tenant/documents/storage/${document.storageFileId}`
        : document.fileUrl,
    })),
    signatureRequests,
    contractLinks: contracts.map((contract) => ({
      id: `contract:${contract.id}`,
      documentType: "CONTRACT",
      documentId: contract.id,
      documentRef: contract.number,
      title: `${contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор"} № ${contract.number}`,
      status: contract.status,
      channel: "WEB_SIGN_LINK",
      allowedMethods: ["SIMPLE_CONFIRMATION"],
      preferredMethod: "SIMPLE_CONFIRMATION",
      webUrl: `${origin}/sign/${contract.signToken}`,
      viewedAt: contract.viewedAt,
      signedAt: contract.signedAt ?? contract.signedByTenantAt,
      createdAt: contract.sentAt,
    })),
  })
}
