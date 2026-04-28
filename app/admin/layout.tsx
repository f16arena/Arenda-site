import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/layout/admin-sidebar"
import { NotificationBell } from "@/components/layout/notification-bell"
import { db } from "@/lib/db"

const ALLOWED_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")
  if (!ALLOWED_ROLES.includes(session.user.role)) redirect("/cabinet")

  const [building, notifications] = await Promise.all([
    db.building.findFirst({ where: { isActive: true } }),
    db.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <AdminSidebar buildingName={building?.name} userRole={session.user.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div />
          <div className="flex items-center gap-4">
            <NotificationBell items={notifications} />
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-[11px] font-semibold text-white">
                  {session.user.name?.[0]?.toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium text-slate-700">
                {session.user.name}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
