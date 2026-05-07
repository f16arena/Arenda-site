import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext } from "@/lib/mobile-context"
import { getMobileAccessibleBuildings } from "@/lib/mobile-buildings"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const { user, org } = result.ctx
  const userPhone = "phone" in user && typeof user.phone === "string" ? user.phone : null
  const buildings = await getMobileAccessibleBuildings(user, org.id)
  const buildingIds = buildings.map((building) => building.id)
  const now = new Date()

  const [unreadNotifications, activeDevices, pendingSignatureRequests, activeNotices, tenantContracts] = await Promise.all([
    db.notification.count({ where: { userId: user.id, isRead: false } }),
    db.pushDevice.count({ where: { userId: user.id, isActive: true, revokedAt: null } }),
    db.documentSignatureRequest.count({
      where: {
        recipientUserId: user.id,
        status: { in: ["PENDING", "VIEWED"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    buildingIds.length > 0
      ? db.buildingNotice.count({
          where: {
            organizationId: org.id,
            buildingId: { in: buildingIds },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
        })
      : Promise.resolve(0),
    user.role === "TENANT"
      ? db.contract.count({
          where: {
            tenant: { userId: user.id, user: { organizationId: org.id } },
            signToken: { not: null },
            status: { in: ["SENT", "VIEWED", "SIGNED_BY_TENANT"] },
          },
        })
      : Promise.resolve(0),
  ])

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: userPhone,
      role: user.role,
    },
    organization: org,
    buildings,
    counters: {
      unreadNotifications,
      activeDevices,
      pendingSignatures: pendingSignatureRequests + tenantContracts,
      activeBuildingNotices: activeNotices,
    },
    menu: buildMobileMenu(user.role),
    featureFlags: {
      nativeMacApp: false,
      pushNotifications: true,
      buildingNotices: true,
      documentViewing: true,
      documentSigningDraft: true,
      smsSigningDraft: true,
      ncaLayerSigning: true,
    },
    surfacePolicy: {
      mobile: [
        "today",
        "building_notices",
        "push_notifications",
        "requests",
        "tasks",
        "messages",
        "meters",
        "payments",
        "document_viewing",
        "document_signature_drafts",
      ],
      webOnly: [
        "superadmin",
        "role_matrix",
        "api_keys",
        "bulk_imports",
        "document_templates",
        "floor_editor",
        "deep_analytics",
        "system_health",
        "audit",
        "data_quality",
      ],
    },
  })
}

function buildMobileMenu(role?: string | null) {
  if (role === "TENANT") {
    return [
      { key: "home", label: "Главная", icon: "house", path: "/" },
      { key: "payments", label: "Оплата", icon: "creditcard", path: "/payments" },
      { key: "requests", label: "Заявки", icon: "wrench.and.screwdriver", path: "/requests" },
      { key: "documents", label: "Документы", icon: "doc.text", path: "/documents" },
      { key: "more", label: "Еще", icon: "ellipsis", path: "/more" },
    ]
  }

  return [
    { key: "today", label: "Сегодня", icon: "list.bullet.rectangle", path: "/" },
    { key: "buildings", label: "Объекты", icon: "building.2", path: "/buildings" },
    { key: "finances", label: "Финансы", icon: "chart.line.uptrend.xyaxis", path: "/finances" },
    { key: "requests", label: "Заявки", icon: "tray.full", path: "/requests" },
    { key: "more", label: "Еще", icon: "ellipsis", path: "/more" },
  ]
}
