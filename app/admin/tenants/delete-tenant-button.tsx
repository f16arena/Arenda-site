"use client"

import { useState, useTransition } from "react"
import { Trash2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { deleteTenant, getTenantDeleteBlockers } from "@/app/actions/tenant"

type Blockers = Awaited<ReturnType<typeof getTenantDeleteBlockers>>

export function DeleteTenantButton({
  tenantId,
  companyName,
  redirectAfter,
}: {
  tenantId: string
  companyName: string
  redirectAfter?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [blockers, setBlockers] = useState<Blockers | null>(null)
  const [pending, startTransition] = useTransition()

  const openDialog = async () => {
    setOpen(true)
    setBlockers(null)
    try {
      const b = await getTenantDeleteBlockers(tenantId)
      setBlockers(b)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось проверить связи")
      setOpen(false)
    }
  }

  const items = blockers
    ? [
        { label: "Начисления", count: blockers.charges },
        { label: "Платежи", count: blockers.payments },
        { label: "Договоры", count: blockers.contracts },
        { label: "Документы", count: blockers.documents },
        { label: "Заявки", count: blockers.requests },
        { label: "Этажи целиком", count: blockers.fullFloors },
      ].filter((x) => x.count > 0)
    : []

  const totalLinks = items.reduce((s, x) => s + x.count, 0)
  const hasLinks = items.length > 0
  const hasSpace = blockers?.hasSpace ?? false

  const handleDelete = (force: boolean) => {
    startTransition(async () => {
      try {
        await deleteTenant(tenantId, { redirectAfter, force })
        toast.success(`Арендатор «${companyName}» удалён`)
        setOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось удалить")
      }
    })
  }

  return (
    <>
      <button
        onClick={openDialog}
        className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Удалить
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Удалить арендатора?
              </h2>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <b>«{companyName}»</b>
              </p>

              {!blockers ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Проверка связей...</p>
              ) : (
                <>
                  {hasSpace && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      Привязан к помещению — оно будет автоматически освобождено.
                    </div>
                  )}

                  {hasLinks ? (
                    <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 space-y-2">
                      <p className="text-xs font-medium text-red-800 dark:text-red-200">
                        Связан с {totalLinks} записями:
                      </p>
                      <ul className="space-y-0.5 text-xs">
                        {items.map((x) => (
                          <li key={x.label} className="flex items-center justify-between text-red-700 dark:text-red-300">
                            <span>• {x.label}</span>
                            <b className="tabular-nums">{x.count}</b>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-red-600 dark:text-red-400 pt-1 border-t border-red-200 dark:border-red-500/20">
                        Каскадное удаление сотрёт всё перечисленное вместе с арендатором. Это действие необратимо.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg px-3 py-2">
                      ✓ Связей нет — можно удалить чисто. Пользователь будет деактивирован.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400"
              >
                Отмена
              </button>
              {blockers && !hasLinks && (
                <button
                  onClick={() => handleDelete(false)}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {pending ? "Удаление..." : "Удалить"}
                </button>
              )}
              {blockers && hasLinks && (
                <button
                  onClick={() => handleDelete(true)}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {pending ? "Удаление..." : `Удалить со всеми связями (${totalLinks})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
