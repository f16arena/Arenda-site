import Link from "next/link"
import { Mail } from "lucide-react"
import { getT } from "@/lib/i18n/server"
import { RichText } from "@/lib/i18n/rich"

/**
 * Баннер на /admin и /cabinet для пользователей с неподтверждённым email.
 * Не показываем если email не указан (телефонный аккаунт без email).
 */
export async function EmailNotVerifiedBanner({
  email, profileHref,
}: {
  email: string | null
  profileHref: string
}) {
  if (!email) return null
  const { t } = await getT()

  return (
    <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/30 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
        <Mail className="h-4 w-4" />
        <span>
          <RichText template={t("common.banners.emailNotVerified")} vars={{ email }} />
        </span>
      </div>
      <Link href={profileHref} className="text-xs font-medium text-amber-700 dark:text-amber-300 underline">
        {t("common.banners.emailVerifyAction")}
      </Link>
    </div>
  )
}
