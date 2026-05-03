"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { Bell } from "lucide-react"

const NotificationPanel = dynamic(
  () => import("./notification-panel").then((mod) => mod.NotificationPanel),
  {
    ssr: false,
    loading: () => (
      <div className="absolute right-0 top-8 z-40 w-[360px] rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Загружаем уведомления...
      </div>
    ),
  },
)

export function NotificationBell({ unreadCount = 0 }: { unreadCount?: number }) {
  const [open, setOpen] = useState(false)
  const [clientUnread, setClientUnread] = useState<number | null>(null)
  const unread = clientUnread ?? unreadCount

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
        aria-label="Уведомления"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel
          initialUnreadCount={unread}
          onClose={() => setOpen(false)}
          onUnreadChange={setClientUnread}
        />
      )}
    </div>
  )
}
