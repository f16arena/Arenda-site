"use client"

import { useState, useTransition, useMemo } from "react"
import Link from "next/link"
import {
  Bell, Check, X, ClipboardList, Wallet, FileText,
  MessageSquare, AlertTriangle, Settings,
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
  createdAt: Date
}

// Группы по type → понятная категория
type Category = "requests" | "payments" | "documents" | "messages" | "alerts" | "other"

const TYPE_TO_CATEGORY: Record<string, Category> = {
  // Заявки
  NEW_REQUEST: "requests",
  REQUEST_STATUS_CHANGED: "requests",
  // Платежи
  PAYMENT_DUE: "payments",
  PAYMENT_RECEIVED: "payments",
  PAYMENT_OVERDUE: "payments",
  // Документы
  DOCUMENT_INVOICE: "documents",
  DOCUMENT_ACT: "documents",
  DOCUMENT_CONTRACT: "documents",
  DOCUMENT_HANDOVER: "documents",
  CONTRACT_EXPIRING: "documents",
  // Сообщения
  MESSAGE_RECEIVED: "messages",
  // Жалобы / алерты
  COMPLAINT: "alerts",
}

const CATEGORY_META: Record<Category, { icon: React.ElementType; label: string; color: string }> = {
  requests: { icon: ClipboardList, label: "Заявки", color: "text-blue-500" },
  payments: { icon: Wallet, label: "Платежи", color: "text-emerald-500" },
  documents: { icon: FileText, label: "Документы", color: "text-purple-500" },
  messages: { icon: MessageSquare, label: "Сообщения", color: "text-cyan-500" },
  alerts: { icon: AlertTriangle, label: "Важное", color: "text-red-500" },
  other: { icon: Settings, label: "Прочее", color: "text-slate-500 dark:text-slate-400 dark:text-slate-500" },
}

const CATEGORY_ORDER: Category[] = ["alerts", "payments", "requests", "documents", "messages", "other"]

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<Category | "all">("all")
  const [showRead, setShowRead] = useState(false)
  const [, startTransition] = useTransition()

  const unread = items.filter((i) => !i.isRead).length

  // Группировка по категориям
  const grouped = useMemo(() => {
    const map = new Map<Category, NotificationItem[]>()
    for (const item of items) {
      const cat = TYPE_TO_CATEGORY[item.type] ?? "other"
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(item)
    }
    return map
  }, [items])

  // Отображаемые после фильтра
  const visibleItems = useMemo(() => {
    let list = activeCategory === "all"
      ? items
      : (grouped.get(activeCategory) ?? [])
    if (!showRead) list = list.filter((i) => !i.isRead)
    return list
  }, [items, grouped, activeCategory, showRead])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300"
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
          <div className="absolute right-0 top-8 z-40 w-[420px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[600px] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Уведомления{unread > 0 ? ` · ${unread} новых` : ""}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowRead((s) => !s)}
                  className="text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:underline"
                >
                  {showRead ? "Только новые" : "Показать все"}
                </button>
                {unread > 0 && (
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        try { await markAllRead() } catch { toast.error("Не удалось") }
                      })
                    }
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Прочитать все
                  </button>
                )}
              </div>
            </div>

            {/* Tabs (категории) */}
            {items.length > 0 && (
              <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <CategoryChip
                  active={activeCategory === "all"}
                  onClick={() => setActiveCategory("all")}
                  label="Все"
                  count={showRead ? items.length : unread}
                />
                {CATEGORY_ORDER.map((cat) => {
                  const list = grouped.get(cat) ?? []
                  if (list.length === 0) return null
                  const unreadInCat = list.filter((i) => !i.isRead).length
                  if (!showRead && unreadInCat === 0) return null
                  const meta = CATEGORY_META[cat]
                  const Icon = meta.icon
                  return (
                    <CategoryChip
                      key={cat}
                      active={activeCategory === cat}
                      onClick={() => setActiveCategory(cat)}
                      label={meta.label}
                      icon={Icon}
                      iconColor={meta.color}
                      count={showRead ? list.length : unreadInCat}
                    />
                  )
                })}
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {visibleItems.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    {items.length === 0 ? "Нет уведомлений" : showRead ? "В этой категории пусто" : "Нет новых уведомлений"}
                  </p>
                </div>
              ) : (
                visibleItems.map((n) => (
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

function CategoryChip({
  active, onClick, label, icon: Icon, iconColor, count,
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
          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-200"
      )}
    >
      {Icon && <Icon className={cn("h-3 w-3", active ? "text-white" : iconColor)} />}
      {label}
      {count > 0 && (
        <span className={cn(
          "rounded-full text-[10px] px-1.5 py-0",
          active ? "bg-white dark:bg-slate-900/20 text-white" : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
        )}>
          {count}
        </span>
      )}
    </button>
  )
}

function NotificationRow({ item, onClose }: { item: NotificationItem; onClose: () => void }) {
  const [, startTransition] = useTransition()
  const cat = TYPE_TO_CATEGORY[item.type] ?? "other"
  const meta = CATEGORY_META[cat]
  const Icon = meta.icon

  const Inner = (
    <div className={cn("px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 group", !item.isRead && "bg-blue-50 dark:bg-blue-500/10/30")}>
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0", "bg-slate-100 dark:bg-slate-800", meta.color)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {!item.isRead && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{item.title}</p>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-2">{item.message}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            {new Date(item.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
          {!item.isRead && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                startTransition(async () => {
                  try { await markNotificationRead(item.id) } catch { toast.error("Ошибка") }
                })
              }}
              className="text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:text-emerald-400"
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
            className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:text-red-400"
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
