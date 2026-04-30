import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { TenantSidebar } from "@/components/layout/tenant-sidebar"
import { NotificationBell } from "@/components/layout/notification-bell"
import { EmailNotVerifiedBanner } from "@/components/layout/email-not-verified-banner"
import { db } from "@/lib/db"

export default async function CabinetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")
  // Платформенный админ никогда не должен попадать в кабинет арендатора,
  // даже если у него role=TENANT в БД.
  if (session.user.isPlatformOwner) redirect("/superadmin")
  if (session.user.role !== "TENANT") redirect("/admin")

  const [tenant, notifications, userMail] = await Promise.all([
    db.tenant.findUnique({
      where: { userId: session.user.id },
      select: { companyName: true },
    }),
    db.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, emailVerifiedAt: true },
    }).catch(() => null),
  ])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-800/50 dark:bg-slate-950">
      <TenantSidebar companyName={tenant?.companyName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {userMail && !userMail.emailVerifiedAt && (
          <EmailNotVerifiedBanner email={userMail.email} profileHref="/cabinet/profile" />
        )}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 pl-16 lg:pl-6">
          <div />
          <div className="flex items-center gap-4">
            <NotificationBell items={notifications} />
            <Link
              href="/cabinet/profile"
              className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 transition"
              title="Открыть профиль"
            >
              <div className="h-7 w-7 rounded-full bg-teal-600 flex items-center justify-center">
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
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
