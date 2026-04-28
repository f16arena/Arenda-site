"use client"

import { useState, useEffect } from "react"
import { Command } from "cmdk"
import { useRouter } from "next/navigation"
import { Search, Building2, Users, ClipboardList, TrendingUp, Loader2 } from "lucide-react"

type Item = {
  type: string
  id: string
  title: string
  subtitle?: string
  href: string
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  tenant: Users,
  space: Building2,
  request: ClipboardList,
  lead: TrendingUp,
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
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
    if (!query || query.length < 2) {
      setItems([])
      return
    }
    setLoading(true)
    const ctrl = new AbortController()
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [query])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4 bg-black/40">
      <Command
        label="Глобальный поиск"
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Search className="h-4 w-4 text-slate-400" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Поиск арендаторов, помещений, заявок, лидов..."
            className="flex-1 outline-none bg-transparent text-sm"
            autoFocus
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          <kbd className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="text-center text-sm text-slate-400 py-8">
            {query.length < 2 ? "Начните вводить запрос..." : "Ничего не найдено"}
          </Command.Empty>

          {items.length > 0 && (
            <Command.Group heading="Результаты" className="text-xs text-slate-400 px-2 py-1">
              {items.map((item) => {
                const Icon = TYPE_ICONS[item.type] ?? Search
                return (
                  <Command.Item
                    key={`${item.type}-${item.id}`}
                    onSelect={() => {
                      router.push(item.href)
                      setOpen(false)
                      setQuery("")
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm hover:bg-slate-100 data-[selected=true]:bg-blue-50"
                  >
                    <Icon className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{item.title}</p>
                      {item.subtitle && <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>}
                    </div>
                  </Command.Item>
                )
              })}
            </Command.Group>
          )}
        </Command.List>

        <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-3">
          <span>↑↓ навигация</span>
          <span>Enter — открыть</span>
          <span>Esc — закрыть</span>
        </div>
      </Command>
    </div>
  )
}
