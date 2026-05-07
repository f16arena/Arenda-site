import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobileTenantRequest } from "@/lib/mobile-tenant"
import { notifyUser } from "@/lib/notify"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"
import {
  REQUEST_ATTACHMENT_ALLOWED_MIME_TYPES,
  REQUEST_ATTACHMENT_MAX_BYTES,
  getTenantStorageScope,
  storeUploadedFile,
} from "@/lib/storage"

export const dynamic = "force-dynamic"

const REQUEST_TYPES = new Set(["TECHNICAL", "INTERNET", "CLEANING", "QUESTION", "OTHER"])
const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"])

export async function GET(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { tenant } = result
  const origin = new URL(req.url).origin
  const requests = await db.request.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      assigneeId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { comments: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const requestIds = requests.map((request) => request.id)
  const attachments = requestIds.length > 0
    ? await db.storedFile.findMany({
        where: {
          tenantId: tenant.id,
          ownerType: "REQUEST_ATTACHMENT",
          ownerId: { in: requestIds },
          deletedAt: null,
        },
        select: { id: true, ownerId: true, fileName: true, mimeType: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : []

  const attachmentsByRequest = new Map<string, typeof attachments>()
  for (const file of attachments) {
    if (!file.ownerId) continue
    const list = attachmentsByRequest.get(file.ownerId) ?? []
    list.push(file)
    attachmentsByRequest.set(file.ownerId, list)
  }

  const active = requests.filter((request) => !["DONE", "CLOSED", "CANCELLED"].includes(request.status)).length
  const waiting = requests.filter((request) => ["NEW", "OPEN"].includes(request.status)).length
  const done = requests.filter((request) => ["DONE", "CLOSED"].includes(request.status)).length

  return NextResponse.json({
    counters: {
      total: requests.length,
      active,
      waiting,
      done,
    },
    data: requests.map((request) => ({
      ...request,
      attachments: (attachmentsByRequest.get(request.id) ?? []).map((file) => ({
        ...file,
        url: `${origin}/api/mobile/tenant/documents/storage/${file.id}`,
      })),
    })),
  })
}

export async function POST(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  const parsed = await parseRequestBody(req)
  const body = parsed.body

  const title = String(body?.title ?? "").trim().slice(0, 140)
  const description = String(body?.description ?? "").trim().slice(0, 1500)
  const type = String(body?.type ?? "OTHER").trim().toUpperCase()
  const priority = String(body?.priority ?? "MEDIUM").trim().toUpperCase()

  if (title.length < 3) return mobileError("Коротко укажите тему заявки")
  if (description.length < 5) return mobileError("Опишите проблему или вопрос")
  if (!REQUEST_TYPES.has(type)) return mobileError("Некорректный тип заявки")
  if (!PRIORITIES.has(priority)) return mobileError("Некорректный приоритет")

  let storedAttachment: { id: string; url: string; fileName: string; mimeType: string } | null = null
  if (parsed.attachment && parsed.attachment.size > 0) {
    try {
      const scope = await getTenantStorageScope(tenant.id)
      storedAttachment = await storeUploadedFile({
        organizationId: ctx.org.id,
        file: parsed.attachment,
        ownerType: "REQUEST_ATTACHMENT",
        buildingId: scope.buildingId,
        tenantId: tenant.id,
        category: "REQUEST_ATTACHMENT",
        visibility: "TENANT_VISIBLE",
        uploadedById: ctx.user.id,
        maxBytes: REQUEST_ATTACHMENT_MAX_BYTES,
        allowedMimeTypes: REQUEST_ATTACHMENT_ALLOWED_MIME_TYPES,
      })
    } catch (error) {
      return mobileError(error instanceof Error ? error.message : "Не удалось сохранить вложение")
    }
  }

  const requestRecord = await db.request.create({
    data: {
      tenantId: tenant.id,
      userId: ctx.user.id,
      title,
      description,
      type,
      priority,
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (storedAttachment) {
    await db.storedFile.update({
      where: { id: storedAttachment.id },
      data: { ownerId: requestRecord.id },
    })
  }

  const admins = await getTenantAdminContactsForUser(ctx.user.id)
  await db.message.createMany({
    data: admins.map((admin) => ({
      fromId: ctx.user.id,
      toId: admin.id,
      subject: `Заявка: ${title}`,
      body: [
        `Арендатор: ${tenant.companyName}`,
        `Тип: ${type}`,
        `Приоритет: ${priority}`,
        storedAttachment ? `Вложение: ${storedAttachment.fileName}` : null,
        "",
        description,
        "",
        `Заявка: #${requestRecord.id}`,
      ].filter(Boolean).join("\n"),
      attachmentUrl: storedAttachment?.url ?? null,
    })),
  })

  await Promise.allSettled(admins.map((admin) => notifyUser({
    userId: admin.id,
    type: "NEW_REQUEST",
    title: `Новая заявка: ${title}`,
    message: `${tenant.companyName}: ${description.slice(0, 180)}${storedAttachment ? " Вложение приложено." : ""}`,
    link: "/admin/requests",
    sendEmail: false,
    sendPush: true,
    pushData: {
      requestId: requestRecord.id,
      tenantId: tenant.id,
      priority,
    },
  })))

  return NextResponse.json({ data: requestRecord }, { status: 201 })
}

async function parseRequestBody(req: Request): Promise<{
  body: {
    title?: string
    description?: string
    type?: string
    priority?: string
  } | null
  attachment: File | null
}> {
  const contentType = req.headers.get("content-type") ?? ""
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    const attachmentValue = form.get("attachment")
    return {
      body: {
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        type: String(form.get("type") ?? ""),
        priority: String(form.get("priority") ?? ""),
      },
      attachment: attachmentValue instanceof File ? attachmentValue : null,
    }
  }

  return {
    body: await req.json().catch(() => null),
    attachment: null,
  }
}
