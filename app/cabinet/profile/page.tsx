export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TelegramSetup } from "@/app/admin/profile/telegram-setup"
import { Send, User } from "lucide-react"
import { ProfileTabs } from "@/components/profile/profile-tabs"

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

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
          <User className="h-5 w-5 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Мой профиль</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {user.name}{user.tenant ? ` · ${user.tenant.companyName}` : ""}
          </p>
        </div>
      </div>

      <ProfileTabs
        currentName={user.name}
        currentEmail={user.email}
        emailVerified={!!user.emailVerifiedAt}
        phone={user.phone}
        notificationsSlot={
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <Send className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">Уведомления в Telegram</h2>
            </div>
            <div className="p-5">
              <TelegramSetup currentChatId={user.telegramChatId} />
            </div>
          </div>
        }
      />
    </div>
  )
}
