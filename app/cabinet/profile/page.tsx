export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TelegramSetup } from "@/app/admin/profile/telegram-setup"
import { Send, User } from "lucide-react"
import { ProfileTabs } from "@/components/profile/profile-tabs"
import { NotificationSettingsForm } from "@/components/profile/notification-settings"
import { getMyNotificationSettings } from "@/app/actions/notification-settings"
import { formatPersonShortName } from "@/lib/display-name"
import { PageHeader } from "@/components/ui/page"

export default async function CabinetProfilePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, name: true, email: true, phone: true,
      telegramChatId: true, emailVerifiedAt: true,
      tenant: { select: { companyName: true } },
    },
  })

  if (!user) redirect("/login")

  const notifSettings = await getMyNotificationSettings()

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        icon={User}
        tone="slate"
        title="Мой профиль"
        subtitle={`${formatPersonShortName(user.name)}${user.tenant ? ` · ${user.tenant.companyName}` : ""}`}
      />

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
      />
    </div>
  )
}
