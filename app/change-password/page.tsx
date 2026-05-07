import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { ChangePasswordForm } from "./change-password-form"

export const dynamic = "force-dynamic"

export default async function ChangePasswordPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true, role: true, name: true, email: true, phone: true },
  })
  if (!user) redirect("/login")

  // Если пароль уже сменён и пользователь зашёл сюда вручную — это нормально,
  // он может сменить пароль ещё раз. Если же он только что сменил и нажал Назад,
  // редирект работает через обычную навигацию.
  const targetAfter = user.role === "TENANT" ? "/cabinet" : "/admin"

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <ChangePasswordForm
        forced={user.mustChangePassword}
        userLogin={user.email ?? user.phone ?? user.name}
        targetAfter={targetAfter}
      />
    </div>
  )
}
