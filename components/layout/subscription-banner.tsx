import Link from "next/link"
import { AlertTriangle } from "lucide-react"

export function SubscriptionBanner({
  daysLeft, isSuspended, isExpired,
}: {
  daysLeft: number | null
  isSuspended: boolean
  isExpired: boolean
}) {
  if (isSuspended) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border-b-2 border-red-300 dark:border-red-500/40 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200">
          <AlertTriangle className="h-4 w-4" />
          Ваша подписка <b>приостановлена</b>. Для возобновления свяжитесь с администрацией платформы.
        </div>
        <Link href="/admin/subscription" className="text-xs font-medium text-red-700 dark:text-red-300 underline">
          Подробнее
        </Link>
      </div>
    )
  }

  if (isExpired) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/30 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-red-800 dark:text-red-200">
          <AlertTriangle className="h-4 w-4" />
          Подписка <b>истекла</b>. Создание объектов ограничено до продления.
        </div>
        <Link href="/admin/subscription" className="text-xs font-medium text-red-700 dark:text-red-300 underline">
          Продлить
        </Link>
      </div>
    )
  }

  if (daysLeft !== null && daysLeft <= 7) {
    return (
      <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/30 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Подписка истекает через <b>{daysLeft}</b> {daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней"}.
        </div>
        <Link href="/admin/subscription" className="text-xs font-medium text-amber-700 dark:text-amber-300 underline">
          Продлить
        </Link>
      </div>
    )
  }

  return null
}
