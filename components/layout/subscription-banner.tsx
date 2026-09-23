import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { getT } from "@/lib/i18n/server"
import { RichText } from "@/lib/i18n/rich"

export async function SubscriptionBanner({
  daysLeft, isSuspended, isExpired,
}: {
  daysLeft: number | null
  isSuspended: boolean
  isExpired: boolean
}) {
  const { t, tp } = await getT()

  if (isSuspended) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border-b-2 border-red-300 dark:border-red-500/40 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200">
          <AlertTriangle className="h-4 w-4" />
          <span>
            <RichText template={t("common.banners.suspended")} />
          </span>
        </div>
        <Link href="/admin/subscription" className="text-xs font-medium text-red-700 dark:text-red-300 underline">
          {t("common.banners.suspendedAction")}
        </Link>
      </div>
    )
  }

  if (isExpired) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/30 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-red-800 dark:text-red-200">
          <AlertTriangle className="h-4 w-4" />
          <span>
            <RichText template={t("common.banners.expired")} />
          </span>
        </div>
        <Link href="/admin/subscription" className="text-xs font-medium text-red-700 dark:text-red-300 underline">
          {t("common.banners.expiredAction")}
        </Link>
      </div>
    )
  }

  if (daysLeft !== null && daysLeft <= 7) {
    return (
      <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/30 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          <span>
            {/* tp сам подставляет число в {count}, RichText остаётся для <b>. */}
            <RichText template={tp("common.banners.expiring", daysLeft)} />
          </span>
        </div>
        <Link href="/admin/subscription" className="text-xs font-medium text-amber-700 dark:text-amber-300 underline">
          {t("common.banners.expiredAction")}
        </Link>
      </div>
    )
  }

  return null
}
