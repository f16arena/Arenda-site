"use client"

import { useState, useTransition } from "react"
import { UserPlus, X, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { assignTenantSpace } from "@/app/actions/tenant"

type Candidate = {
  id: string
  companyName: string
  /** В каком помещении сейчас (если есть) — для предупреждения о переезде */
  currentSpace: { number: string; floorName: string } | null
}

export function AssignTenantButton({
  spaceId,
  spaceNumber,
  candidates,
}: {
  spaceId: string
  spaceNumber: string
  candidates: Candidate[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [pending, startTransition] = useTransition()

  const filtered = search
    ? candidates.filter((c) =>
        c.companyName.toLowerCase().includes(search.toLowerCase()),
      )
    : candidates

  const apply = (tenantId: string, companyName: string, currentSpace: Candidate["currentSpace"]) => {
    if (currentSpace) {
      if (!window.confirm(
        `«${companyName}» сейчас занимает Каб. ${currentSpace.number} (${currentSpace.floorName}).\n\n` +
        `Переселить в кабинет ${spaceNumber}? Старый кабинет освободится.`,
      )) return
    }
    startTransition(async () => {
      try {
        await assignTenantSpace(tenantId, spaceId)
        toast.success(`«${companyName}» назначен в Каб. ${spaceNumber}`)
        setOpen(false)
        setSearch("")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось назначить")
      }
    })
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium"
        title="Назначить арендатора"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Назначить
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <>
          {/* Closer overlay */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 right-0 top-6 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Каб. {spaceNumber} → арендатор
              </p>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <input
                type="search"
                placeholder="Поиск по названию..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Нет арендаторов</p>
                  <Link
                    href="/admin/tenants"
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    Создать нового →
                  </Link>
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => apply(c.id, c.companyName, c.currentSpace)}
                    disabled={pending}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 border-b border-slate-100 dark:border-slate-800 last:border-0 disabled:opacity-50"
                  >
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {c.companyName}
                    </p>
                    {c.currentSpace && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                        Сейчас: Каб. {c.currentSpace.number} · {c.currentSpace.floorName} (переедет)
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
