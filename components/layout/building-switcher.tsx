"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Building2, ChevronDown, Plus, Check } from "lucide-react"
import { switchBuilding } from "@/app/actions/buildings"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export type BuildingOption = {
  id: string
  name: string
  address: string
}

export function BuildingSwitcher({
  current,
  options,
  canCreate,
}: {
  current: BuildingOption | null
  options: BuildingOption[]
  canCreate: boolean
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  if (options.length === 0 && !current) {
    if (canCreate) {
      return (
        <Link
          href="/admin/buildings"
          className="flex items-center gap-2 rounded-lg bg-amber-100 hover:bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-800"
        >
          <Plus className="h-4 w-4" />
          Создать первое здание
        </Link>
      )
    }
    return null
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-sm"
      >
        <Building2 className="h-4 w-4 text-slate-500" />
        <div className="text-left">
          <p className="text-sm font-medium text-slate-900 leading-tight">{current?.name ?? "Выберите здание"}</p>
          {current && <p className="text-[10px] text-slate-500 leading-tight">{current.address}</p>}
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Здания</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {options.map((b) => {
                const isCurrent = current?.id === b.id
                return (
                  <button
                    key={b.id}
                    onClick={() => {
                      if (isCurrent) {
                        setOpen(false)
                        return
                      }
                      startTransition(async () => {
                        try {
                          await switchBuilding(b.id)
                          toast.success(`Переключено: ${b.name}`)
                          setOpen(false)
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Ошибка")
                        }
                      })
                    }}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100",
                      isCurrent && "bg-blue-50 hover:bg-blue-50"
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                      isCurrent ? "bg-blue-600" : "bg-slate-100"
                    )}>
                      <Building2 className={cn("h-4 w-4", isCurrent ? "text-white" : "text-slate-500")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{b.name}</p>
                      <p className="text-xs text-slate-500 truncate">{b.address}</p>
                    </div>
                    {isCurrent && <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />}
                  </button>
                )
              })}
            </div>
            <Link
              href="/admin/buildings"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-50 border-t border-slate-100"
            >
              <span>Управление зданиями</span>
              {canCreate && <Plus className="h-3.5 w-3.5" />}
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
