import Link from "next/link"
import { Mail } from "lucide-react"

/**
 * Баннер на /admin и /cabinet для пользователей с неподтверждённым email.
 * Не показываем если email не указан (телефонный аккаунт без email).
 */
export function EmailNotVerifiedBanner({
  email, profileHref,
}: {
  email: string | null
  profileHref: string
}) {
  if (!email) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-amber-800">
        <Mail className="h-4 w-4" />
        Email <b>{email}</b> не подтверждён.
      </div>
      <Link href={profileHref} className="text-xs font-medium text-amber-700 underline">
        Подтвердить
      </Link>
    </div>
  )
}
