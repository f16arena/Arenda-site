"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { deleteAllSpacesInBuilding } from "@/app/actions/spaces"

const CONFIRM_WORD = "удалить"

export function WipeAllSpacesButton({
  buildingId,
  buildingName,
  spacesCount,
}: {
  buildingId: string
  buildingName: string
  spacesCount: number
}) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [pending, startTransition] = useTransition()

  if (spacesCount === 0) return null

  const confirmed = confirmText.trim().toLowerCase() === CONFIRM_WORD

  const handleDelete = () => {
    if (!confirmed || pending) return
    startTransition(async () => {
      try {
        const result = await deleteAllSpacesInBuilding(buildingId, confirmText)
        toast.success(`Удалено помещений: ${result.count}`)
        setConfirmText("")
        setOpen(false)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось удалить помещения")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        title={`Очистить помещения в здании ${buildingName}`}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
      >
        <Trash2 className="h-4 w-4" />
        {pending ? "Удаление..." : "Очистить всё"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Очистить все помещения?
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Здание: {buildingName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!pending) {
                    setOpen(false)
                    setConfirmText("")
                  }
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                Это удалит все созданные помещения в выбранном здании, если они не привязаны к арендаторам.
                Если хотя бы одно помещение занято арендатором или этаж сдан целиком, система заблокирует очистку.
              </div>

              <div className="text-sm text-slate-600 dark:text-slate-300">
                <p>Будет проверено помещений: <b>{spacesCount}</b>.</p>
                <p className="mt-1">Этажи и само здание не удаляются, но записи помещений восстановить автоматически нельзя.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Для подтверждения напишите: <span className="font-semibold text-slate-900 dark:text-slate-100">удалить</span>
                </label>
                <input
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  disabled={pending}
                  autoFocus
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setConfirmText("")
                }}
                disabled={pending}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!confirmed || pending}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700"
              >
                <Trash2 className="h-4 w-4" />
                {pending ? "Удаление..." : "Удалить помещения"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
