import { auth } from "@/auth"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { AdminSidebar } from "@/components/layout/admin-sidebar"
import { NotificationBell } from "@/components/layout/notification-bell"
import { BuildingSwitcher } from "@/components/layout/building-switcher"
import { CommandPaletteLoader } from "@/components/layout/command-palette-loader"
import { ImpersonateBanner } from "@/components/layout/impersonate-banner"
import { PlatformViewBanner } from "@/components/layout/platform-view-banner"
import { SubscriptionBanner } from "@/components/layout/subscription-banner"
import { EmailNotVerifiedBanner } from "@/components/layout/email-not-verified-banner"
import { ThemeIconToggle } from "@/components/theme-icon-toggle"
import { AdminSelectOrg } from "@/components/superadmin/admin-select-org"
import { db } from "@/lib/db"
import { CURRENT_BUILDING_COOKIE, resolveCurrentBuildingIdFromSelection } from "@/lib/current-building"
import { isOwnerLike } from "@/lib/building-access"
import { getValidatedImpersonateData, getCurrentOrgId } from "@/lib/org"
import { safeServerValue } from "@/lib/server-fallback"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import {
  getCachedAdminShellBuildings,
  getCachedAdminShellOrg,
  getCachedAdminShellSections,
  getCachedAdminShellUser,
  getCachedUnreadNotificationCount,
} from "@/lib/admin-shell-cache"

const ALLOWED_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return measureServerRoute("/admin/layout", () => renderAdminLayout(children))
}

async function renderAdminLayout(children: React.ReactNode) {
  const session = await auth()
  if (!session) redirect("/login")
  const isPlatformOwner = session.user.isPlatformOwner ?? false
  // Платформенному админу разрешаем доступ к /admin независимо от role.
  if (!isPlatformOwner && !ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/cabinet")
  }
  const impersonate = isPlatformOwner ? await getValidatedImpersonateData().catch(() => null) : null
  const currentOrgId = isPlatformOwner
    ? (impersonate?.orgId ?? await getCurrentOrgId().catch(() => null))
    : (session.user.organizationId ?? null)

  // Платформенный админ без выбранной организации — показываем экран выбора
  if (isPlatformOwner && !currentOrgId && !impersonate) {
    const orgs = await measureServerStep("/admin/layout", "platform-org-picker", safeServerValue(
      db.organization.findMany({
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        include: {
          plan: { select: { name: true } },
          _count: { select: { buildings: true, users: true } },
        },
      }),
      [],
      { source: "admin.layout.orgPicker", route: "/admin", userId: session.user.id },
    ))

    const mapped = orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      isActive: o.isActive,
      isSuspended: o.isSuspended,
      planExpiresAt: o.planExpiresAt,
      planName: o.plan?.name ?? null,
      buildingsCount: o._count.buildings,
      usersCount: o._count.users,
      hasOwner: !!o.ownerUserId,
    }))

    return <AdminSelectOrg orgs={mapped} userName={session.user.name ?? "Платформа"} />
  }

  const [currentOrg, freshUser, allBuildings, unreadNotifications, allowedSections] = await measureServerStep("/admin/layout", "admin-shell-data", Promise.all([
    currentOrgId
      ? safeServerValue(
          getCachedAdminShellOrg(currentOrgId),
          null,
          { source: "admin.layout.currentOrg", route: "/admin", orgId: currentOrgId, userId: session.user.id },
        )
      : Promise.resolve(null),
    safeServerValue(
      getCachedAdminShellUser(session.user.id),
      null,
      { source: "admin.layout.freshUser", route: "/admin", orgId: currentOrgId ?? undefined, userId: session.user.id },
    ),
    currentOrgId
      ? safeServerValue(
          getCachedAdminShellBuildings(session.user.id, currentOrgId, session.user.role, isPlatformOwner),
          [] as Array<{ id: string; name: string; address: string }>,
          { source: "admin.layout.accessibleBuildings", route: "/admin", orgId: currentOrgId, userId: session.user.id },
        )
      : Promise.resolve([] as Array<{ id: string; name: string; address: string }>),
    safeServerValue(
      getCachedUnreadNotificationCount(session.user.id),
      0,
      { source: "admin.layout.unreadNotifications", route: "/admin", orgId: currentOrgId ?? undefined, userId: session.user.id },
    ),
    getCachedAdminShellSections(session.user.role, isPlatformOwner),
  ]))

  const store = await cookies()
  const currentBuildingId = resolveCurrentBuildingIdFromSelection({
    cookieValue: store.get(CURRENT_BUILDING_COOKIE)?.value,
    accessibleBuildings: allBuildings,
    role: session.user.role,
    isPlatformOwner,
  })
  const building = allBuildings.find((item) => item.id === currentBuildingId) ?? null
  const isPlatformView = isPlatformOwner && !impersonate && !!currentOrg
  const displayUserName = freshUser?.name?.trim() || session.user.name || "Профиль"

  const now = new Date()
  const planExpiresAt = currentOrg?.planExpiresAtIso ? new Date(currentOrg.planExpiresAtIso) : null
  const isExpired = !!(planExpiresAt && planExpiresAt < now)
  const daysLeft = planExpiresAt
    ? Math.max(0, Math.ceil((planExpiresAt.getTime() - now.getTime()) / 86_400_000))
    : null
  const aggregateLabel = isOwnerLike(session.user.role, session.user.isPlatformOwner) ? "Все здания" : "Мои здания"
  const aggregateSubtitle = isOwnerLike(session.user.role, session.user.isPlatformOwner)
    ? "Общая картина по всем зданиям"
    : "Обзор назначенных зданий"

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-800/50 dark:bg-slate-950">
      <CommandPaletteLoader />
      <AdminSidebar
        buildingName={building?.name ?? aggregateLabel}
        userRole={session.user.role}
        allowedSections={allowedSections}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {impersonate && currentOrg && <ImpersonateBanner orgName={currentOrg.name} />}
        {isPlatformView && currentOrg && <PlatformViewBanner orgName={currentOrg.name} />}
        {!impersonate && !isPlatformView && currentOrg && (
          <SubscriptionBanner
            daysLeft={daysLeft}
            isSuspended={currentOrg.isSuspended ?? false}
            isExpired={isExpired}
          />
        )}
        {freshUser?.email && !freshUser.emailVerifiedAtIso && (
          <EmailNotVerifiedBanner email={freshUser.email} profileHref="/admin/profile" />
        )}
        {/* Top Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 pl-16 lg:pl-6">
          <BuildingSwitcher
            current={building ? { id: building.id, name: building.name, address: building.address } : null}
            options={allBuildings}
            canCreate={session.user.role === "OWNER"}
            aggregateLabel={allBuildings.length > 1 || !building ? aggregateLabel : undefined}
            aggregateSubtitle={aggregateSubtitle}
          />
          <div className="flex items-center gap-4">
            <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-800 dark:border-slate-700">
              Ctrl+K — поиск
            </kbd>
            <ThemeIconToggle />
            <NotificationBell unreadCount={unreadNotifications} />
            <Link
              href="/admin/profile"
              className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 transition"
              title="Открыть профиль"
            >
              <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-[11px] font-semibold text-white">
                  {displayUserName[0]?.toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 dark:text-slate-200">
                {displayUserName}
              </span>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
