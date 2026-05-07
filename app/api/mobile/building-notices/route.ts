import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { getBuildingNoticeRecipients, getMobileAccessibleBuildings } from "@/lib/mobile-buildings"
import { notifyUser } from "@/lib/notify"

export const dynamic = "force-dynamic"

const NOTICE_TYPES = new Set(["INFO", "ELECTRICITY", "HOT_WATER", "COLD_WATER", "HEATING", "REPAIR", "SECURITY", "OTHER"])
const SEVERITIES = new Set(["INFO", "WARNING", "CRITICAL"])

export async function GET(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const url = new URL(req.url)
  const requestedBuildingId = url.searchParams.get("buildingId")
  const buildings = await getMobileAccessibleBuildings(result.ctx.user, result.ctx.org.id)
  const allowedIds = new Set(buildings.map((building) => building.id))
  const buildingIds = requestedBuildingId
    ? (allowedIds.has(requestedBuildingId) ? [requestedBuildingId] : [])
    : [...allowedIds]

  if (buildingIds.length === 0) return NextResponse.json({ data: [] })

  const notices = await db.buildingNotice.findMany({
    where: {
      organizationId: result.ctx.org.id,
      buildingId: { in: buildingIds },
    },
    select: {
      id: true,
      buildingId: true,
      type: true,
      severity: true,
      title: true,
      message: true,
      startsAt: true,
      endsAt: true,
      sentAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return NextResponse.json({ data: notices })
}

export async function POST(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const role = result.ctx.user.role
  if (!["OWNER", "ADMIN", "FACILITY_MANAGER"].includes(role ?? "")) {
    return mobileError("Only owner, admin or facility manager can create building notices", 403)
  }

  const body = await req.json().catch(() => null) as {
    buildingId?: string
    type?: string
    severity?: string
    title?: string
    message?: string
    startsAt?: string
    endsAt?: string
    sendPush?: boolean
  } | null

  const buildingId = body?.buildingId?.trim()
  const title = body?.title?.trim().slice(0, 140)
  const message = body?.message?.trim().slice(0, 1000)
  const type = (body?.type ?? "INFO").trim().toUpperCase()
  const severity = (body?.severity ?? "INFO").trim().toUpperCase()

  if (!buildingId) return mobileError("buildingId is required")
  if (!title || title.length < 3) return mobileError("Title is too short")
  if (!message || message.length < 5) return mobileError("Message is too short")
  if (!NOTICE_TYPES.has(type)) return mobileError("Invalid notice type")
  if (!SEVERITIES.has(severity)) return mobileError("Invalid severity")

  const allowedBuildings = await getMobileAccessibleBuildings(result.ctx.user, result.ctx.org.id)
  if (!allowedBuildings.some((building) => building.id === buildingId)) {
    return mobileError("No access to this building", 403)
  }

  const startsAt = body?.startsAt ? new Date(body.startsAt) : null
  const endsAt = body?.endsAt ? new Date(body.endsAt) : null
  if (startsAt && Number.isNaN(startsAt.getTime())) return mobileError("Invalid startsAt")
  if (endsAt && Number.isNaN(endsAt.getTime())) return mobileError("Invalid endsAt")

  const notice = await db.buildingNotice.create({
    data: {
      organizationId: result.ctx.org.id,
      buildingId,
      createdById: result.ctx.user.id,
      type,
      severity,
      title,
      message,
      startsAt,
      endsAt,
      sentAt: new Date(),
    },
    select: {
      id: true,
      buildingId: true,
      type: true,
      severity: true,
      title: true,
      message: true,
      startsAt: true,
      endsAt: true,
      sentAt: true,
      createdAt: true,
    },
  })

  const recipients = await getBuildingNoticeRecipients(result.ctx.org.id, buildingId)
  const recipientUsers = recipients.length > 0
    ? await db.user.findMany({
        where: { id: { in: recipients } },
        select: { id: true, role: true },
      })
    : []

  await Promise.allSettled(recipientUsers.map((recipient) => notifyUser({
    userId: recipient.id,
    type: "BUILDING_NOTICE",
    title,
    message,
    link: recipient.role === "TENANT" ? "/cabinet" : "/admin/ops",
    sendEmail: false,
    sendTelegram: false,
    sendPush: body?.sendPush !== false,
    pushData: {
      noticeId: notice.id,
      buildingId,
      noticeType: type,
      severity,
    },
  })))

  return NextResponse.json({
    data: notice,
    delivery: {
      recipients: recipientUsers.length,
      pushRequested: body?.sendPush !== false,
    },
  })
}
