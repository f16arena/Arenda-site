"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  Bell,
  Check,
  X,
  ClipboardList,
  Wallet,
  FileText,
  MessageSquare,
  AlertTriangle,
  Settings,
  Loader2,
} from "lucide-react"
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
  createdAt: string
}

type Category = "requests" | "payments" | "documents" | "messages" | "alerts" | "other"

const TYPE_TO_CATEGORY: Record<string, Category> = {
  NEW_REQUEST: "requests",
  REQUEST_STATUS_CHANGED: "requests",
  PAYMENT_DUE: "payments",
  PAYMENT_RECEIVED: "payments",
  PAYMENT_OVERDUE: "payments",
  DOCUMENT_INVOICE: "documents",
  DOCUMENT_ACT: "documents",
  DOCUMENT_CONTRACT: "documents",
  DOCUMENT_HANDOVER: "documents",
  CONTRACT_EXPIRING: "documents",
  MESSAGE_RECEIVED: "messages",
  COMPLAINT: "alerts",
}

const CATEGORY_META: Record<Category, { icon: React.ElementType; label: string; color: string }> = {
  requests: { icon: ClipboardList, label: "Заявки", color: "text-blue-500" },
  payments: { icon: Wallet, label: "Платежи", color: "text-emerald-500" },
  documents: { icon: FileText, label: "Документы", color: "text-purple-500" },
  messages: { icon: MessageSquare, label: "Сообщения", color: "text-cyan-500" },
  alerts: { icon: AlertTriangle, label: "Важное", color: "text-red-500" },
  other: { icon: Settings, label: "Прочее", color: "text-slate-500 dark:text-slate-400" },
}

const CATEGORY_ORDER: Category[] = ["alerts", "payments", "requests", "documents", "messages", "other"]

export function NotificationPanel({
  initialUnreadCount,
  onClose,
  onUnreadChange,
}: {
  initialUnreadCount: number
  onClose: () => void
  onUnreadChange: (count: number) => void
}) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(initialUnreadCount)
  const [activeCategory, setActiveCategory] = useState<Category | "all">("all")
  const [showRead, setShowRead] = useState(false)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()

  const syncUnread = useCallback((nextItems: NotificationItem[], fallback = 0) => {
    const count = nextItems.length > 0 ? nextItems.filter((item) => !item.isRead).length : fallback
    setUnread(count)
    onUnreadChange(count)
  }, [onUnreadChange])

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" })
      if (!response.ok) throw new Error("notifications fetch failed")
      const data = await response.json() as { items?: NotificationItem[]; unreadCount?: number }
      const nextItems = data.items ?? []
      setItems(nextItems)
      syncUnread(nextItems, data.unreadCount ?? 0)
    } catch {
      toast.error("Не удалось загрузить уведомления")
    } finally {
      setLoading(false)
    }
  }, [syncUnread])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadNotifications()
    }, 0)
    return () => window.clearTimeout(id)
  }, [loadNotifications])

  const grouped = useMemo(() => {
    const map = new Map<Category, NotificationItem[]>()
    for (const item of items) {
      const cat = TYPE_TO_CATEGORY[item.type] ?? "other"
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(item)
    }
    return map
  }, [items])

  const visibleItems = useMemo(() => {
    let list = activeCategory === "all" ? items : (grouped.get(activeCategory) ?? [])
    if (!showRead) list = list.filter((item) => !item.isRead)
    return list
  }, [items, grouped, activeCategory, showRead])

  function applyItems(nextItems: NotificationItem[]) {
    setItems(nextItems)
    syncUnread(nextItems)
  }

  function markReadLocal(id: string) {
    const nextItems = items.map((item) => item.id === id ? { ...item, isRead: true } : item)
    applyItems(nextItems)
    startTransition(async () => {
      try {
        await markNotificationRead(id)
      } catch {
        toast.error("Не удалось отметить уведомление")
        void loadNotifications()
      }
    })
  }

  function deleteLocal(id: string) {
    const nextItems = items.filter((item) => item.id !== id)
    applyItems(nextItems)
    startTransition(async () => {
      try {
        await deleteNotification(id)
      } catch {
        toast.error("Не удалось удалить уведомление")
        void loadNotifications()
      }
    })
  }

  function markAllLocal() {
    const nextItems = items.map((item) => ({ ...item, isRead: true }))
    applyItems(nextItems)
    startTransition(async () => {
      try {
        await markAllRead()
      } catch {
        toast.error("Не удалось")
        void loadNotifications()
      }
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-8 z-40 flex max-h-[600px] w-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Уведомления{unread > 0 ? ` · ${unread} новых` : ""}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowRead((value) => !value)}
              className="text-xs text-slate-600 hover:underline dark:text-slate-400"
            >
              {showRead ? "Только новые" : "Показать все"}
            </button>
            {unread > 0 && (
              <button onClick={markAllLocal} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                Прочитать все
              </button>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <CategoryChip
              active={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
              label="Все"
              count={showRead ? items.length : unread}
            />
            {CATEGORY_ORDER.map((cat) => {
              const list = grouped.get(cat) ?? []
              if (list.length === 0) return null
              const unreadInCat = list.filter((item) => !item.isRead).length
              if (!showRead && unreadInCat === 0) return null
              const meta = CATEGORY_META[cat]
              return (
                <CategoryChip
                  key={cat}
                  active={activeCategory === cat}
                  onClick={() => setActiveCategory(cat)}
                  label={meta.label}
                  icon={meta.icon}
                  iconColor={meta.color}
                  count={showRead ? list.length : unreadInCat}
                />
              )
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем уведомления...
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="mx-auto mb-2 h-8 w-8 text-slate-200" />
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {items.length === 0 ? "Нет уведомлений" : showRead ? "В этой категории пусто" : "Нет новых уведомлений"}
              </p>
            </div>
          ) : (
            visibleItems.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                onClose={onClose}
                onRead={markReadLocal}
                onDelete={deleteLocal}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function CategoryChip({
  active,
  onClick,
  label,
  icon: Icon,
  iconColor,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: React.ElementType
  iconColor?: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition",
        active
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400",
      )}
    >
      {Icon && <Icon className={cn("h-3 w-3", active ? "text-white" : iconColor)} />}
      {label}
      {count > 0 && (
        <span className={cn(
          "rounded-full px-1.5 py-0 text-[10px]",
          active ? "bg-white/20 text-white" : "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-300",
        )}>
          {count}
        </span>
      )}
    </button>
  )
}

function NotificationRow({
  item,
  onClose,
  onRead,
  onDelete,
}: {
  item: NotificationItem
  onClose: () => void
  onRead: (id: string) => void
  onDelete: (id: string) => void
}) {
  const cat = TYPE_TO_CATEGORY[item.type] ?? "other"
  const meta = CATEGORY_META[cat]
  const Icon = meta.icon

  const inner = (
    <div className={cn(
      "group border-b border-slate-100 px-5 py-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50",
      !item.isRead && "bg-blue-50 dark:bg-blue-500/10",
    )}>
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800", meta.color)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {!item.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{item.message}</p>
          <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
            {new Date(item.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1 opacity-0 transition group-hover:opacity-100">
          {!item.isRead && (
            <button
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onRead(item.id)
              }}
              className="text-slate-400 hover:text-emerald-600 dark:text-slate-500 dark:hover:text-emerald-400"
              title="Отметить прочитанным"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onDelete(item.id)
            }}
            className="text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
            title="Удалить"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )

  if (!item.link) return inner

  return (
    <Link
      href={item.link}
      onClick={() => {
        onClose()
        if (!item.isRead) onRead(item.id)
      }}
    >
      {inner}
    </Link>
  )
}
