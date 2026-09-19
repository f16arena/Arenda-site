"use client"

import { useState, useTransition } from "react"
import { UserPlus, X, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { assignTenantToPlace } from "@/app/actions/builder-premise"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

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

  const performAssign = (tenantId: string, companyName: string) => {
    startTransition(async () => {
      try {
        const res = await assignTenantToPlace(tenantId, spaceId)
        if (!res.ok) throw new Error(res.error)
        toast.success(`«${companyName}» назначен в Каб. ${spaceNumber}`)
        setOpen(false)
        setSearch("")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось назначить")
      }
    })
  }

  return (
    // Панель поверх страницы (портал): внутри таблицы с прокруткой старое
    // absolute-меню обрезалось.
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium"
        title="Назначить арендатора"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Назначить
        <ChevronDown className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 gap-0 overflow-hidden p-0"
        onInteractOutside={(e) => {
          if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"],[role="alertdialog"]')) e.preventDefault()
        }}
      >
          <div>
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Каб. {spaceNumber} → арендатор
              </p>
              <button onClick={() => setOpen(false)} aria-label="Закрыть" className="text-slate-400 hover:text-slate-600">
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
                filtered.map((c) => {
                  const buttonContent = (
                    <>
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {c.companyName}
                      </p>
                      {c.currentSpace && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          Сейчас: Каб. {c.currentSpace.number} · {c.currentSpace.floorName} (переедет)
                        </p>
                      )}
                    </>
                  )
                  if (c.currentSpace) {
                    const cs = c.currentSpace
                    return (
                      <ConfirmDialog
                        key={c.id}
                        title={`Переселить «${c.companyName}» в кабинет ${spaceNumber}?`}
                        description={`Сейчас занимает Каб. ${cs.number} (${cs.floorName}). Старый кабинет освободится.`}
                        confirmLabel="Переселить"
                        onConfirm={() => performAssign(c.id, c.companyName)}
                        trigger={
                          <button
                            disabled={pending}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 border-b border-slate-100 dark:border-slate-800 last:border-0 disabled:opacity-50"
                          >
                            {buttonContent}
                          </button>
                        }
                      />
                    )
                  }
                  return (
                    <button
                      key={c.id}
                      onClick={() => performAssign(c.id, c.companyName)}
                      disabled={pending}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 border-b border-slate-100 dark:border-slate-800 last:border-0 disabled:opacity-50"
                    >
                      {buttonContent}
                    </button>
                  )
                })
              )}
            </div>
          </div>
      </PopoverContent>
    </Popover>
  )
}
