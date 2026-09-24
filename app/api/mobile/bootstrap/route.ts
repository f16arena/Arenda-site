import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext } from "@/lib/mobile-context"
import { getMobileAccessibleBuildings } from "@/lib/mobile-buildings"
import { getT, getTForUser } from "@/lib/i18n/server"

type Tr = Awaited<ReturnType<typeof getT>>["t"]

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const { user, org } = result.ctx
  // Подписи меню отдаёт сервер, а читает их владелец аккаунта в приложении:
  // язык берём из его профиля, cookie в bearer-запросе нет.
  const { t } = await getTForUser(user.id)
  const userPhone = "phone" in user && typeof user.phone === "string" ? user.phone : null
  const buildings = await getMobileAccessibleBuildings(user, org.id)
  const buildingIds = buildings.map((building) => building.id)
  const now = new Date()

  const [unreadNotifications, activeDevices, pendingSignatureRequests, activeNotices, tenantContracts, twoFactor] = await Promise.all([
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
    db.user.findUnique({
      where: { id: user.id },
      select: { totpEnabledAt: true, locale: true },
    }).catch(() => null),
  ])

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: userPhone,
      role: user.role,
      totpEnabled: !!twoFactor?.totpEnabledAt,
      // Язык интерфейса из профиля: приложение показывает тот же язык, что и кабинет.
      locale: twoFactor?.locale ?? "ru",
    },
    organization: org,
    buildings,
    counters: {
      unreadNotifications,
      activeDevices,
      pendingSignatures: pendingSignatureRequests + tenantContracts,
      activeBuildingNotices: activeNotices,
    },
    menu: buildMobileMenu(user.role, t),
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

// key и icon — контракт с приложением, их не переводим; переводится только label.
function buildMobileMenu(role: string | null | undefined, t: Tr) {
  if (role === "TENANT") {
    return [
      { key: "home", label: t("emails.mobileNav.home"), icon: "house", path: "/" },
      { key: "payments", label: t("emails.mobileNav.payments"), icon: "creditcard", path: "/payments" },
      { key: "requests", label: t("emails.mobileNav.requests"), icon: "wrench.and.screwdriver", path: "/requests" },
      { key: "documents", label: t("emails.mobileNav.documents"), icon: "doc.text", path: "/documents" },
      { key: "more", label: t("emails.mobileNav.more"), icon: "ellipsis", path: "/more" },
    ]
  }

  return [
    { key: "today", label: t("emails.mobileNav.today"), icon: "list.bullet.rectangle", path: "/" },
    { key: "buildings", label: t("emails.mobileNav.buildings"), icon: "building.2", path: "/buildings" },
    { key: "finances", label: t("emails.mobileNav.finances"), icon: "chart.line.uptrend.xyaxis", path: "/finances" },
    { key: "requests", label: t("emails.mobileNav.requests"), icon: "tray.full", path: "/requests" },
    { key: "more", label: t("emails.mobileNav.more"), icon: "ellipsis", path: "/more" },
  ]
}
