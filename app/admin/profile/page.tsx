export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TelegramSetup } from "./telegram-setup"
import { Send, User } from "lucide-react"
import { ProfileTabs } from "@/components/profile/profile-tabs"
import { ManagementHub } from "@/components/profile/management-hub"
import { NotificationSettingsForm } from "@/components/profile/notification-settings"
import { getMyNotificationSettings } from "@/app/actions/notification-settings"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  ACCOUNTANT: "Бухгалтер",
  FACILITY_MANAGER: "Управляющий",
  EMPLOYEE: "Сотрудник",
}

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      telegramChatId: true, emailVerifiedAt: true,
    },
  })

  if (!user) redirect("/login")

  const notifSettings = await getMyNotificationSettings()

  // Hub-статистика только для OWNER (показываем количество объектов рядом с ссылками)
  const isOwner = user.role === "OWNER"
  let stats: { buildings: number; spaces: number; staff: number; tenants: number } | undefined
  if (isOwner) {
    try {
      const { orgId } = await requireOrgAccess()
      const [buildings, spaces, staff, tenants] = await Promise.all([
        db.building.count({ where: { organizationId: orgId } }).catch(() => 0),
        db.space.count({ where: { floor: { building: { organizationId: orgId } } } }).catch(() => 0),
        db.user.count({ where: { organizationId: orgId, role: { not: "TENANT" }, isActive: true } }).catch(() => 0),
        db.tenant.count({ where: tenantScope(orgId) }).catch(() => 0),
      ])
      stats = { buildings, spaces, staff, tenants }
    } catch {
      stats = undefined
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          <User className="h-5 w-5 text-slate-700 dark:text-slate-300" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Мой профиль</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
            {user.name} · {ROLE_LABELS[user.role] ?? user.role}
          </p>
        </div>
      </div>

      <ProfileTabs
        currentName={user.name}
        currentEmail={user.email}
        emailVerified={!!user.emailVerifiedAt}
        phone={user.phone}
        notificationsSlot={
          <div className="space-y-5">
            <NotificationSettingsForm initial={notifSettings} />
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <Send className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Telegram-бот</h2>
              </div>
              <div className="p-5">
                <TelegramSetup currentChatId={user.telegramChatId} />
              </div>
            </div>
          </div>
        }
        managementSlot={isOwner ? <ManagementHub stats={stats} /> : undefined}
      />
    </div>
  )
}
