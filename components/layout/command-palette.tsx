"use client"

import { useState, useEffect, useMemo } from "react"
import { useT } from "@/lib/i18n/client"
import { Command } from "cmdk"
import { useRouter } from "next/navigation"
import {
  Search, Building2, Users, ClipboardList, TrendingUp, Loader2,
  FileText, UserCog, Wallet, CalendarDays, Plus, LayoutDashboard,
  Receipt, ShieldCheck, Activity, Rocket, CircleHelp, LogOut,
} from "lucide-react"

type Item = {
  type: string
  id: string
  title: string
  subtitle?: string
  href: string
}

const TYPE_META: Record<string, { icon: React.ElementType; key: string }> = {
  tenant: { icon: Users, key: "tenant" },
  space: { icon: Building2, key: "space" },
  request: { icon: ClipboardList, key: "request" },
  lead: { icon: TrendingUp, key: "lead" },
  contract: { icon: FileText, key: "contract" },
  document: { icon: Receipt, key: "document" },
  staff: { icon: UserCog, key: "staff" },
}

// Быстрые действия — всегда доступны без поиска.
// key — путь подписи в словаре, keywords — слова для поиска на всех языках.
const QUICK_ACTIONS: { key: string; href: string; icon: React.ElementType; keywords: string }[] = [
  { key: "dashboard", href: "/admin", icon: LayoutDashboard, keywords: "главная dashboard басты бет" },
  { key: "onboarding", href: "/admin/onboarding", icon: Rocket, keywords: "onboarding запуск настройка чеклист старт іске қосу баптау" },
  { key: "calendar", href: "/admin/calendar", icon: CalendarDays, keywords: "calendar события күнтізбе" },
  { key: "tenants", href: "/admin/tenants", icon: Users, keywords: "tenants клиенты арендаторы жалға алушылар" },
  { key: "finances", href: "/admin/finances", icon: Wallet, keywords: "finance деньги финансы қаржы" },
  { key: "documents", href: "/admin/documents", icon: FileText, keywords: "documents документы құжаттар" },
  { key: "createDocument", href: "/admin/documents?create=1", icon: Plus, keywords: "документ создать договор счет акт авр сверка құжат жасау шарт шот" },
  { key: "dataQuality", href: "/admin/data-quality", icon: ShieldCheck, keywords: "data quality ошибки проверка деректер сапасы" },
  { key: "systemHealth", href: "/admin/system-health", icon: Activity, keywords: "health система production env cron sitemap ошибки жүйе тексеру" },
  { key: "faq", href: "/admin/faq", icon: CircleHelp, keywords: "faq помощь инструкция как сделать подписать пароль счет заявка көмек нұсқаулық" },
  { key: "requests", href: "/admin/requests", icon: ClipboardList, keywords: "requests заявки өтінімдер" },
  { key: "staff", href: "/admin/staff", icon: UserCog, keywords: "staff сотрудники қызметкерлер" },
]

const QUICK_CREATE: { key: string; href: string; icon: React.ElementType; keywords: string }[] = [
  { key: "contract", href: "/admin/documents?create=contract", icon: Plus, keywords: "договор contract rental новый шарт жасау" },
  { key: "invoice", href: "/admin/documents?create=invoice", icon: Plus, keywords: "счет invoice новый шот төлем" },
  { key: "payment", href: "/admin/finances?newPayment=1", icon: Plus, keywords: "платёж payment оплата новый төлем" },
  { key: "avr", href: "/admin/documents?create=avr", icon: Plus, keywords: "акт авр act выполненных работ услуги орындалған жұмыстар" },
  { key: "reconciliation", href: "/admin/documents?create=reconciliation", icon: Plus, keywords: "сверка reconciliation салыстыру актісі" },
  { key: "tenant", href: "/admin/tenants?new=1", icon: Plus, keywords: "арендатор новый создать жалға алушы қосу" },
]

const SYSTEM_ACTIONS: { key: string; icon: React.ElementType; keywords: string; action: "logout" }[] = [
  { key: "logout", icon: LogOut, keywords: "logout signout выход выйти шығу", action: "logout" },
]

interface CommandPaletteProps {
  openSignal?: number
}

export function CommandPalette({ openSignal = 0 }: CommandPaletteProps) {
  const { t } = useT()
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
      if (e.key === "Escape" && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

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

  function performLogout() {
    setOpen(false)
    setQuery("")
    const form = document.createElement("form")
    form.action = "/api/logout"
    form.method = "POST"
    document.body.appendChild(form)
    form.submit()
  }

  if (!open) return null

  const showQuickPanels = query.length < 2

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4 bg-black/40" onClick={() => setOpen(false)}>
      <Command
        label={t("common.palette.label")}
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder={t("common.palette.placeholder")}
            className="flex-1 outline-none bg-transparent text-sm"
            autoFocus
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />}
          <kbd className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">
            {query.length < 2
              ? t("common.palette.startTyping")
              : t("common.palette.nothingFound")}
          </Command.Empty>

          {showQuickPanels && (
            <>
              <Command.Group heading={t("common.palette.groupGo")} className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 py-1">
                {QUICK_ACTIONS.map((a) => {
                  const Icon = a.icon
                  const label = t(`common.palette.go.${a.key}` as "common.palette.go.dashboard")
                  return (
                    <Command.Item
                      key={a.key}
                      value={`${label} ${a.keywords}`}
                      onSelect={() => go(a.href)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 data-[selected=true]:bg-blue-50 dark:bg-blue-500/10"
                    >
                      <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                      <span className="flex-1 text-slate-900 dark:text-slate-100">{label}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>

              <Command.Group heading={t("common.palette.groupCreate")} className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 py-1 mt-2">
                {QUICK_CREATE.map((a) => {
                  const Icon = a.icon
                  const label = t(`common.palette.create.${a.key}` as "common.palette.create.contract")
                  return (
                    <Command.Item
                      key={a.key}
                      value={`${label} ${a.keywords}`}
                      onSelect={() => go(a.href)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 data-[selected=true]:bg-blue-50 dark:bg-blue-500/10"
                    >
                      <Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span className="flex-1 text-slate-900 dark:text-slate-100">{label}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>

              <Command.Group heading={t("common.palette.groupAccount")} className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 py-1 mt-2">
                {SYSTEM_ACTIONS.map((a) => {
                  const Icon = a.icon
                  const label = t(`common.palette.account.${a.key}` as "common.palette.account.logout")
                  return (
                    <Command.Item
                      key={a.action}
                      value={`${label} ${a.keywords}`}
                      onSelect={() => {
                        if (a.action === "logout") performLogout()
                      }}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 data-[selected=true]:bg-red-50 dark:bg-red-500/10"
                    >
                      <Icon className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="flex-1 text-slate-900 dark:text-slate-100">{label}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            </>
          )}

          {!showQuickPanels && groupedItems.map(([type, list]) => {
            const meta = TYPE_META[type]
            const Icon = meta?.icon ?? Search
            const heading = meta
              ? t(`common.palette.types.${meta.key}` as "common.palette.types.tenant")
              : type
            return (
              <Command.Group
                key={type}
                heading={`${heading} (${list.length})`}
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
                      {item.subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.subtitle}</p>}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )
          })}
        </Command.List>

        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-3">
          <span>{t("common.palette.hintNav")}</span>
          <span>{t("common.palette.hintOpen")}</span>
          <span>{t("common.palette.hintClose")}</span>
        </div>
      </Command>
    </div>
  )
}
