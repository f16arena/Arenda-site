import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobileTenantRequest } from "@/lib/mobile-tenant"
import {
  TENANT_DOCUMENT_ALLOWED_MIME_TYPES,
  TENANT_DOCUMENT_MAX_BYTES,
  getTenantStorageScope,
  storeUploadedFile,
} from "@/lib/storage"

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
        reconStatus: true,
        reconResponseNote: true,
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

export async function POST(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  const origin = new URL(req.url).origin

  const contentType = req.headers.get("content-type") ?? ""
  if (!contentType.includes("multipart/form-data")) {
    return mobileError("Прикрепите файл (multipart/form-data)")
  }

  const form = await req.formData()
  const type = String(form.get("type") ?? "OTHER")
  const name = String(form.get("name") ?? "").trim()
  const file = form.get("file")

  if (!name) return mobileError("Название документа обязательно")
  if (!(file instanceof File) || file.size === 0) return mobileError("Файл документа обязателен")

  const scope = await getTenantStorageScope(tenant.id)

  const stored = await storeUploadedFile({
    organizationId: ctx.org.id,
    file,
    ownerType: "TENANT_DOCUMENT",
    ownerId: tenant.id,
    buildingId: scope.buildingId,
    tenantId: scope.tenantId,
    category: "TENANT_DOCUMENT",
    visibility: "TENANT_VISIBLE",
    uploadedById: ctx.user.id,
    maxBytes: TENANT_DOCUMENT_MAX_BYTES,
    allowedMimeTypes: TENANT_DOCUMENT_ALLOWED_MIME_TYPES,
  })

  const doc = await db.tenantDocument.create({
    data: {
      tenantId: tenant.id,
      type,
      name,
      fileUrl: stored.url,
      storageFileId: stored.id,
    },
    select: {
      id: true,
      type: true,
      name: true,
      fileUrl: true,
      storageFileId: true,
      createdAt: true,
    },
  })

  await db.storedFile.update({
    where: { id: stored.id },
    data: { ownerId: doc.id },
  })

  return NextResponse.json(
    {
      data: {
        ...doc,
        source: "tenant_document",
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        fileSize: stored.originalSize,
        downloadUrl: `${origin}/api/mobile/tenant/documents/storage/${stored.id}`,
      },
    },
    { status: 201 },
  )
}

export async function DELETE(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { tenant } = result
  const url = new URL(req.url)
  const id = url.searchParams.get("id")?.trim()
  if (!id) return mobileError("Не указан id документа")

  const doc = await db.tenantDocument.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, storageFileId: true },
  })
  if (!doc) return mobileError("Документ не найден", 404)

  await db.tenantDocument.delete({ where: { id: doc.id } })
  if (doc.storageFileId) {
    await db.storedFile
      .update({
        where: { id: doc.storageFileId },
        data: { deletedAt: new Date() },
      })
      .catch(() => null)
  }

  return NextResponse.json({ ok: true })
}
