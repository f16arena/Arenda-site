export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TelegramSetup } from "./telegram-setup"
import { Send, User } from "lucide-react"
import { ProfileTabs } from "@/components/profile/profile-tabs"
import { NotificationSettingsForm } from "@/components/profile/notification-settings"
import { TwoFactorCard } from "@/components/two-factor-card"
import { getMyNotificationSettings } from "@/app/actions/notification-settings"
import { formatPersonShortName } from "@/lib/display-name"
import { PageHeader } from "@/components/ui/page"
// Вкладка «Управление» (ManagementHub) удалена 2026-05-26:
// её 14 тайлов либо дублировали sidebar, либо были настройками,
// которые теперь живут в свёрнутой секции «НАСТРОЙКИ» в sidebar.
// Профиль = только про «меня»: Личное / Email / Безопасность / Уведомления.

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  ACCOUNTANT: "Бухгалтер",
  FACILITY_MANAGER: "Управляющий",
  EMPLOYEE: "Сотрудник",
}

type ProfileSearchParams = { tab?: string | string[] }

export default async function ProfilePage({ searchParams }: { searchParams?: Promise<ProfileSearchParams> }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const resolvedSearchParams = (await searchParams) ?? {}
  const tabParamRaw = resolvedSearchParams.tab
  const tabParam = Array.isArray(tabParamRaw) ? tabParamRaw[0] : tabParamRaw
  const allowedTabs = ["general", "security", "email", "notifications"] as const
  type AllowedTab = typeof allowedTabs[number]
  // Старый ?tab=management из закладок — молча открываем дефолтную вкладку
  // (Личное). Кто увидит «потерянный раздел» и поищет — найдёт его в sidebar
  // как НАСТРОЙКИ.
  const initialTab: AllowedTab | undefined = allowedTabs.includes(tabParam as AllowedTab)
    ? (tabParam as AllowedTab)
    : undefined

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      telegramChatId: true, emailVerifiedAt: true, totpEnabledAt: true,
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
        subtitle={`${formatPersonShortName(user.name)} · ${ROLE_LABELS[user.role] ?? user.role}`}
      />

      <ProfileTabs
        currentName={user.name}
        currentEmail={user.email}
        emailVerified={!!user.emailVerifiedAt}
        phone={user.phone}
        initialTab={initialTab}
        notificationsSlot={
          <div className="space-y-5">
            <TwoFactorCard enabled={!!user.totpEnabledAt} />
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
