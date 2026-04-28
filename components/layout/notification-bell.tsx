"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Bell, Check, X } from "lucide-react"
import { toast } from "sonner"
import { markNotificationRead, markAllRead, deleteNotification } from "@/app/actions/notifications"
import { cn } from "@/lib/utils"

export type NotificationItem = {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  isRead: boolean
  createdAt: Date
}

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const unread = items.filter((i) => !i.isRead).length

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative text-slate-500 hover:text-slate-700"
        aria-label="Уведомления"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-40 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[500px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-900">Уведомления</p>
              {unread > 0 && (
                <button
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await markAllRead()
                      } catch {
                        toast.error("Не удалось")
                      }
                    })
                  }
                  className="text-xs text-blue-600 hover:underline"
                >
                  Прочитать все
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Нет уведомлений</p>
                </div>
              ) : (
                items.map((n) => (
                  <NotificationRow key={n.id} item={n} onClose={() => setOpen(false)} />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function NotificationRow({ item, onClose }: { item: NotificationItem; onClose: () => void }) {
  const [, startTransition] = useTransition()

  const Inner = (
    <div className={cn("px-5 py-3 hover:bg-slate-50 border-b border-slate-100 group", !item.isRead && "bg-blue-50/30")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {!item.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
            <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
          </div>
          <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{item.message}</p>
          <p className="text-[10px] text-slate-400 mt-1">
            {new Date(item.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
          {!item.isRead && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                startTransition(async () => {
                  try { await markNotificationRead(item.id) } catch { toast.error("Ошибка") }
                })
              }}
              className="text-slate-400 hover:text-emerald-600"
              title="Отметить прочитанным"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              startTransition(async () => {
                try { await deleteNotification(item.id) } catch { toast.error("Ошибка") }
              })
            }}
            className="text-slate-400 hover:text-red-600"
            title="Удалить"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )

  if (item.link) {
    return (
      <Link
        href={item.link}
        onClick={() => {
          onClose()
          if (!item.isRead) {
            startTransition(async () => {
              try { await markNotificationRead(item.id) } catch {}
            })
          }
        }}
      >
        {Inner}
      </Link>
    )
  }
  return Inner
}
