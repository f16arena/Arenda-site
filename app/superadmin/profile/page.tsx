export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Shield } from "lucide-react"
import { ProfileTabs } from "@/components/profile/profile-tabs"

export default async function SuperadminProfilePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.isPlatformOwner) redirect("/admin")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true, role: true, emailVerifiedAt: true },
  })

  if (!user) redirect("/login")

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
          <Shield className="h-5 w-5 text-purple-700" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Мой профиль</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{user.name} · Платформенный администратор</p>
        </div>
      </div>

      <ProfileTabs
        currentName={user.name}
        currentEmail={user.email}
        emailVerified={!!user.emailVerifiedAt}
        phone={user.phone}
      />
    </div>
  )
}
