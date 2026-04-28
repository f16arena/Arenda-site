import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TenantSidebar } from "@/components/layout/tenant-sidebar"
import { db } from "@/lib/db"
import { Bell } from "lucide-react"

export default async function CabinetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "TENANT") redirect("/admin")

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: { companyName: true },
  })

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <TenantSidebar companyName={tenant?.companyName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div />
          <div className="flex items-center gap-4">
            <button className="relative text-slate-500 hover:text-slate-700">
              <Bell className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-teal-600 flex items-center justify-center">
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
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
