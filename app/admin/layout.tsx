import { auth } from "@/auth"
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
import { getCurrentBuildingId } from "@/lib/current-building"
import { getAccessibleBuildingsForSession, isOwnerLike } from "@/lib/building-access"
import { getAllowedSections } from "@/lib/acl"
import { getValidatedImpersonateData, getCurrentOrgId } from "@/lib/org"

const ALLOWED_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")
  const isPlatformOwner = session.user.isPlatformOwner ?? false
  // Платформенному админу разрешаем доступ к /admin независимо от role.
  if (!isPlatformOwner && !ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/cabinet")
  }
  const impersonate = await getValidatedImpersonateData().catch(() => null)
  const currentOrgId = await getCurrentOrgId().catch(() => null)

  // Платформенный админ без выбранной организации — показываем экран выбора
  if (isPlatformOwner && !currentOrgId && !impersonate) {
    const orgs = await db.organization.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        plan: { select: { name: true } },
        _count: { select: { buildings: true, users: true } },
      },
    }).catch(() => [])

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

  const currentBuildingId = await getCurrentBuildingId().catch(() => null)
  const currentOrg = currentOrgId
    ? await db.organization.findUnique({
        where: { id: currentOrgId },
        select: { id: true, name: true, isSuspended: true, planExpiresAt: true },
      }).catch(() => null)
    : null
  const isPlatformView = isPlatformOwner && !impersonate && !!currentOrg

  const now = new Date()
  const isExpired = !!(currentOrg?.planExpiresAt && currentOrg.planExpiresAt < now)
  const daysLeft = currentOrg?.planExpiresAt
    ? Math.max(0, Math.ceil((currentOrg.planExpiresAt.getTime() - now.getTime()) / 86_400_000))
    : null
  // Подгружаем email/emailVerifiedAt для баннера "Подтвердите email".
  // Платформенному админу баннер не нужен — он сам управляет.
  const userMail = !isPlatformOwner
    ? await db.user.findUnique({
        where: { id: session.user.id },
        select: { email: true, emailVerifiedAt: true },
      }).catch(() => null)
    : null

  const [building, allBuildings, unreadNotifications, allowedSections] = await Promise.all([
    currentBuildingId
      ? db.building.findUnique({
          where: { id: currentBuildingId },
          select: { id: true, name: true, address: true, isActive: true },
        }).catch(() => null)
      : Promise.resolve(null),
    (async () => {
      if (!currentOrgId) return [] as Array<{ id: string; name: string; address: string }>
      return getAccessibleBuildingsForSession(currentOrgId).catch(() => [] as Array<{ id: string; name: string; address: string }>)
    })(),
    db.notification.count({
      where: { userId: session.user.id, isRead: false },
    }).catch(() => 0),
    getAllowedSections(session.user.role),
  ])
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
        allowedSections={Array.from(allowedSections)}
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
        {userMail && !userMail.emailVerifiedAt && (
          <EmailNotVerifiedBanner email={userMail.email} profileHref="/admin/profile" />
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
                  {session.user.name?.[0]?.toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 dark:text-slate-200">
                {session.user.name}
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
