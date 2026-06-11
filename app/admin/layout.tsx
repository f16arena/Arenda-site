import * as Sentry from "@sentry/nextjs"
import { Suspense } from "react"
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
import { formatPersonShortName, getDisplayInitial } from "@/lib/display-name"
import {
  getCachedAdminShellBuildings,
  getCachedAdminShellCapabilities,
  getCachedAdminShellOrg,
  getCachedAdminShellSections,
  getCachedAdminShellUser,
  getCachedUnreadNotificationCount,
} from "@/lib/admin-shell-cache"
import { isTenantRole } from "@/lib/role-capabilities"

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
  // Sentry user context — без email/PII (sendDefaultPii: false). Помогает группировать
  // ошибки по пользователям и понимать impact инцидентов.
  Sentry.setUser({
    id: session.user.id,
    role: session.user.role,
    organizationId: session.user.organizationId ?? undefined,
    isPlatformOwner,
  })
  // Платформенному админу разрешаем доступ к /admin независимо от role.
  if (!isPlatformOwner && isTenantRole(session.user.role)) {
    redirect("/cabinet")
  }
  // Параллельно: некешируемая проверка смены пароля и impersonate-контекст —
  // не держим их последовательно, чтобы не растягивать TTFB.
  const [passwordCheck, impersonate] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { mustChangePassword: true },
    }).catch(() => null),
    isPlatformOwner ? getValidatedImpersonateData().catch(() => null) : Promise.resolve(null),
  ])
  // Принудительная смена пароля при первом входе (актуальное значение из БД).
  if (passwordCheck?.mustChangePassword) {
    redirect("/change-password")
  }
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

    return <AdminSelectOrg orgs={mapped} userName={formatPersonShortName(session.user.name, "Платформа")} />
  }

  // Каркас отдаётся сразу; данные сайдбара и шапки (кешируются) стримятся
  // через Suspense, поэтому страница (children) начинает рендериться немедленно,
  // а не ждёт shell-данные. Это резко снижает TTFB всех /admin-страниц.
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <CommandPaletteLoader />
      <Suspense fallback={<aside className="hidden lg:block w-60 shrink-0 bg-slate-900" />}>
        <SidebarChrome
          userId={session.user.id}
          userName={session.user.name}
          role={session.user.role}
          isPlatformOwner={isPlatformOwner}
          currentOrgId={currentOrgId}
        />
      </Suspense>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Suspense fallback={<div className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />}>
          <HeaderChrome
            userId={session.user.id}
            userName={session.user.name}
            role={session.user.role}
            isPlatformOwner={isPlatformOwner}
            currentOrgId={currentOrgId}
            isImpersonating={!!impersonate}
          />
        </Suspense>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}

async function SidebarChrome({
  userId,
  userName,
  role,
  isPlatformOwner,
  currentOrgId,
}: {
  userId: string
  userName?: string | null
  role: string
  isPlatformOwner: boolean
  currentOrgId: string | null
}) {
  const [allBuildings, allowedSections, allowedCapabilities, sidebarOrg] = await measureServerStep("/admin/layout", "sidebar-data", Promise.all([
    currentOrgId
      ? safeServerValue(
          getCachedAdminShellBuildings(userId, currentOrgId, role, isPlatformOwner),
          [] as Array<{ id: string; name: string; address: string }>,
          { source: "admin.layout.accessibleBuildings", route: "/admin", orgId: currentOrgId, userId },
        )
      : Promise.resolve([] as Array<{ id: string; name: string; address: string }>),
    getCachedAdminShellSections(userId, role, isPlatformOwner),
    getCachedAdminShellCapabilities(userId, role, isPlatformOwner, currentOrgId),
    currentOrgId
      ? safeServerValue(
          getCachedAdminShellOrg(currentOrgId),
          null,
          { source: "admin.layout.sidebarOrg", route: "/admin", orgId: currentOrgId, userId },
        )
      : Promise.resolve(null),
  ]))

  const store = await cookies()
  const currentBuildingId = resolveCurrentBuildingIdFromSelection({
    cookieValue: store.get(CURRENT_BUILDING_COOKIE)?.value,
    accessibleBuildings: allBuildings,
    role,
    isPlatformOwner,
  })
  const building = allBuildings.find((item) => item.id === currentBuildingId) ?? null
  const aggregateLabel = isOwnerLike(role, isPlatformOwner) ? "Все здания" : "Мои здания"

  return (
    <AdminSidebar
      buildingName={building?.name ?? aggregateLabel}
      orgLogoUrl={sidebarOrg?.logoUrl ?? null}
      userRole={role}
      userName={formatPersonShortName(userName)}
      allowedSections={allowedSections}
      allowedCapabilities={allowedCapabilities}
      isPlatformOwner={isPlatformOwner}
    />
  )
}

async function HeaderChrome({
  userId,
  userName,
  role,
  isPlatformOwner,
  currentOrgId,
  isImpersonating,
}: {
  userId: string
  userName: string | null | undefined
  role: string
  isPlatformOwner: boolean
  currentOrgId: string | null
  isImpersonating: boolean
}) {
  const [currentOrg, freshUser, allBuildings, unreadNotifications] = await measureServerStep("/admin/layout", "header-data", Promise.all([
    currentOrgId
      ? safeServerValue(
          getCachedAdminShellOrg(currentOrgId),
          null,
          { source: "admin.layout.currentOrg", route: "/admin", orgId: currentOrgId, userId },
        )
      : Promise.resolve(null),
    safeServerValue(
      getCachedAdminShellUser(userId),
      null,
      { source: "admin.layout.freshUser", route: "/admin", orgId: currentOrgId ?? undefined, userId },
    ),
    currentOrgId
      ? safeServerValue(
          getCachedAdminShellBuildings(userId, currentOrgId, role, isPlatformOwner),
          [] as Array<{ id: string; name: string; address: string }>,
          { source: "admin.layout.accessibleBuildings", route: "/admin", orgId: currentOrgId, userId },
        )
      : Promise.resolve([] as Array<{ id: string; name: string; address: string }>),
    safeServerValue(
      getCachedUnreadNotificationCount(userId),
      0,
      { source: "admin.layout.unreadNotifications", route: "/admin", orgId: currentOrgId ?? undefined, userId },
    ),
  ]))

  const store = await cookies()
  const currentBuildingId = resolveCurrentBuildingIdFromSelection({
    cookieValue: store.get(CURRENT_BUILDING_COOKIE)?.value,
    accessibleBuildings: allBuildings,
    role,
    isPlatformOwner,
  })
  const building = allBuildings.find((item) => item.id === currentBuildingId) ?? null
  const isPlatformView = isPlatformOwner && !isImpersonating && !!currentOrg
  const organizationOwnerName = role === "OWNER"
    ? currentOrg?.directorName?.trim() || currentOrg?.shortName?.trim() || null
    : null
  const displayUserName = formatPersonShortName(organizationOwnerName || freshUser?.name?.trim() || userName)

  const now = new Date()
  const planExpiresAt = currentOrg?.planExpiresAtIso ? new Date(currentOrg.planExpiresAtIso) : null
  const isExpired = !!(planExpiresAt && planExpiresAt < now)
  const daysLeft = planExpiresAt
    ? Math.max(0, Math.ceil((planExpiresAt.getTime() - now.getTime()) / 86_400_000))
    : null
  const aggregateLabel = isOwnerLike(role, isPlatformOwner) ? "Все здания" : "Мои здания"
  const aggregateSubtitle = isOwnerLike(role, isPlatformOwner)
    ? "Общая картина по всем зданиям"
    : "Обзор назначенных зданий"

  return (
    <>
      {isImpersonating && currentOrg && <ImpersonateBanner orgName={currentOrg.name} />}
      {isPlatformView && currentOrg && <PlatformViewBanner orgName={currentOrg.name} />}
      {!isImpersonating && !isPlatformView && currentOrg && (
        <SubscriptionBanner
          daysLeft={daysLeft}
          isSuspended={currentOrg.isSuspended ?? false}
          isExpired={isExpired}
        />
      )}
      {freshUser?.email && !freshUser.emailVerifiedAtIso && (
        <EmailNotVerifiedBanner email={freshUser.email} profileHref="/admin/profile" />
      )}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 sm:px-6 pl-16 lg:pl-6">
        <BuildingSwitcher
          current={building ? { id: building.id, name: building.name, address: building.address } : null}
          options={allBuildings}
          canCreate={role === "OWNER"}
          aggregateLabel={allBuildings.length > 1 || !building ? aggregateLabel : undefined}
          aggregateSubtitle={aggregateSubtitle}
        />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-4">
          <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-800 dark:border-slate-700">
            Ctrl+K — поиск
          </kbd>
          <ThemeIconToggle />
          <NotificationBell unreadCount={unreadNotifications} />
          <Link
            href="/admin/profile"
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 sm:px-2 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 transition"
            title="Открыть профиль"
          >
            <div className="h-7 w-7 shrink-0 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-[11px] font-semibold text-white">
                {getDisplayInitial(displayUserName)}
              </span>
            </div>
            <span className="hidden sm:inline text-sm font-medium text-slate-700 dark:text-slate-300 max-w-[12rem] truncate">
              {displayUserName}
            </span>
          </Link>
        </div>
      </header>
    </>
  )
}
