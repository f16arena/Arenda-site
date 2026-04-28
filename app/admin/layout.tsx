import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/layout/admin-sidebar"
import { NotificationBell } from "@/components/layout/notification-bell"
import { BuildingSwitcher } from "@/components/layout/building-switcher"
import { CommandPalette } from "@/components/layout/command-palette"
import { db } from "@/lib/db"
import { getCurrentBuildingId } from "@/lib/current-building"
import { getAllowedSections } from "@/lib/acl"

const ALLOWED_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")
  if (!ALLOWED_ROLES.includes(session.user.role)) redirect("/cabinet")

  const currentBuildingId = await getCurrentBuildingId().catch(() => null)
  const [building, allBuildings, notifications, allowedSections] = await Promise.all([
    currentBuildingId
      ? db.building.findUnique({
          where: { id: currentBuildingId },
          select: { id: true, name: true, address: true, isActive: true },
        }).catch(() => null)
      : Promise.resolve(null),
    db.building.findMany({
      where: { isActive: true },
      select: { id: true, name: true, address: true },
      orderBy: { createdAt: "asc" },
    }).catch(() => [] as Array<{ id: string; name: string; address: string }>),
    // Может упасть если миграция 005 не применена
    db.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, type: true, title: true, message: true, link: true, isRead: true, createdAt: true },
    }).catch(() => [] as Array<{ id: string; type: string; title: string; message: string; link: string | null; isRead: boolean; createdAt: Date }>),
    getAllowedSections(session.user.role),
  ])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <CommandPalette />
      <AdminSidebar
        buildingName={building?.name}
        userRole={session.user.role}
        allowedSections={Array.from(allowedSections)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <BuildingSwitcher
            current={building ? { id: building.id, name: building.name, address: building.address } : null}
            options={allBuildings}
            canCreate={session.user.role === "OWNER"}
          />
          <div className="flex items-center gap-4">
            <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-slate-500 bg-slate-100 rounded border border-slate-200">
              Ctrl+K — поиск
            </kbd>
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
