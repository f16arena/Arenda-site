"use client"

import { useState, useEffect, useMemo } from "react"
import { Command } from "cmdk"
import { useRouter } from "next/navigation"
import {
  Search, Building2, Users, ClipboardList, TrendingUp, Loader2,
  FileText, UserCog, Wallet, CalendarDays, Plus, LayoutDashboard,
  Receipt,
} from "lucide-react"

type Item = {
  type: string
  id: string
  title: string
  subtitle?: string
  href: string
}

const TYPE_META: Record<string, { icon: React.ElementType; label: string }> = {
  tenant: { icon: Users, label: "Арендаторы" },
  space: { icon: Building2, label: "Помещения" },
  request: { icon: ClipboardList, label: "Заявки" },
  lead: { icon: TrendingUp, label: "Лиды" },
  contract: { icon: FileText, label: "Договоры" },
  document: { icon: Receipt, label: "Документы" },
  staff: { icon: UserCog, label: "Сотрудники" },
}

// Быстрые действия — всегда доступны без поиска
const QUICK_ACTIONS: { label: string; href: string; icon: React.ElementType; keywords: string }[] = [
  { label: "Дашборд", href: "/admin", icon: LayoutDashboard, keywords: "главная dashboard" },
  { label: "Календарь", href: "/admin/calendar", icon: CalendarDays, keywords: "calendar события" },
  { label: "Арендаторы", href: "/admin/tenants", icon: Users, keywords: "tenants клиенты" },
  { label: "Лиды (CRM)", href: "/admin/leads", icon: TrendingUp, keywords: "leads crm" },
  { label: "Финансы", href: "/admin/finances", icon: Wallet, keywords: "finance деньги" },
  { label: "Документы", href: "/admin/documents", icon: FileText, keywords: "documents" },
  { label: "Заявки", href: "/admin/requests", icon: ClipboardList, keywords: "requests" },
  { label: "Сотрудники", href: "/admin/staff", icon: UserCog, keywords: "staff" },
]

const QUICK_CREATE: { label: string; href: string; icon: React.ElementType; keywords: string }[] = [
  { label: "Создать счёт на оплату", href: "/admin/documents/templates/invoice", icon: Plus, keywords: "счет invoice новый" },
  { label: "Создать акт услуг", href: "/admin/documents/templates/act", icon: Plus, keywords: "акт act" },
  { label: "Создать акт сверки", href: "/admin/documents/templates/reconciliation", icon: Plus, keywords: "сверка reconciliation" },
  { label: "Добавить арендатора", href: "/admin/tenants?new=1", icon: Plus, keywords: "арендатор новый создать" },
  { label: "Добавить лида", href: "/admin/leads?new=1", icon: Plus, keywords: "лид lead" },
]

interface CommandPaletteProps {
  openSignal?: number
}

export function CommandPalette({ openSignal = 0 }: CommandPaletteProps) {
  const [open, setOpen] = useState(() => openSignal > 0)
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    const debounce = setTimeout(() => {
      if (!query || query.length < 2) {
        setItems([])
        setLoading(false)
        return
      }
      setLoading(true)
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setItems(d.items ?? []))
        .catch(() => {})
        .finally(() => setLoading(false))
    }, query.length < 2 ? 0 : 200)
    return () => {
      ctrl.abort()
      clearTimeout(debounce)
    }
  }, [query])

  // Группируем результаты по типу
  const groupedItems = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const item of items) {
      if (!map.has(item.type)) map.set(item.type, [])
      map.get(item.type)!.push(item)
    }
    return Array.from(map.entries())
  }, [items])

  function go(href: string) {
    router.push(href)
    setOpen(false)
    setQuery("")
  }

  if (!open) return null

  const showQuickPanels = query.length < 2

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4 bg-black/40" onClick={() => setOpen(false)}>
      <Command
        label="Глобальный поиск"
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Поиск или быстрое действие..."
            className="flex-1 outline-none bg-transparent text-sm"
            autoFocus
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />}
          <kbd className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">
            {query.length < 2 ? "Начните вводить запрос..." : "Ничего не найдено"}
          </Command.Empty>

          {showQuickPanels && (
            <>
              <Command.Group heading="Перейти" className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 py-1">
                {QUICK_ACTIONS.map((a) => {
                  const Icon = a.icon
                  return (
                    <Command.Item
                      key={a.href}
                      value={`${a.label} ${a.keywords}`}
                      onSelect={() => go(a.href)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 data-[selected=true]:bg-blue-50 dark:bg-blue-500/10"
                    >
                      <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                      <span className="flex-1 text-slate-900 dark:text-slate-100">{a.label}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>

              <Command.Group heading="Создать" className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 py-1 mt-2">
                {QUICK_CREATE.map((a) => {
                  const Icon = a.icon
                  return (
                    <Command.Item
                      key={a.href}
                      value={`${a.label} ${a.keywords}`}
                      onSelect={() => go(a.href)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 data-[selected=true]:bg-blue-50 dark:bg-blue-500/10"
                    >
                      <Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span className="flex-1 text-slate-900 dark:text-slate-100">{a.label}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            </>
          )}

          {!showQuickPanels && groupedItems.map(([type, list]) => {
            const meta = TYPE_META[type] ?? { icon: Search, label: type }
            const Icon = meta.icon
            return (
              <Command.Group
                key={type}
                heading={`${meta.label} (${list.length})`}
                className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 py-1"
              >
                {list.map((item) => (
                  <Command.Item
                    key={`${item.type}-${item.id}`}
                    value={`${item.title} ${item.subtitle ?? ""}`}
                    onSelect={() => go(item.href)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 data-[selected=true]:bg-blue-50 dark:bg-blue-500/10"
                  >
                    <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{item.title}</p>
                      {item.subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 truncate">{item.subtitle}</p>}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )
          })}
        </Command.List>

        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-3">
          <span>↑↓ навигация</span>
          <span>Enter — открыть</span>
          <span>Esc — закрыть</span>
        </div>
      </Command>
    </div>
  )
}
