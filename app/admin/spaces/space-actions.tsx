"use client"

import { useState, useTransition } from "react"
import { Plus, X, Edit2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createSpace, updateSpace, deleteSpace } from "@/app/actions/spaces"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

type Floor = { id: string; name: string; number: number }
type Space = { id: string; number: string; area: number; status: string; description: string | null }

const STATUSES = [
  { value: "VACANT", label: "Свободно" },
  { value: "OCCUPIED", label: "Занято" },
  { value: "MAINTENANCE", label: "Обслуживание" },
]

export function AddSpaceDialog({ floors }: { floors: Floor[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" />
        Добавить помещение
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold">Новое помещение</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await createSpace(fd)
                    toast.success("Помещение создано")
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось создать")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Этаж *</label>
                <select name="floorId" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Номер кабинета *</label>
                  <input name="number" required placeholder="101" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Площадь, м² *</label>
                  <input name="area" type="number" step="0.1" required placeholder="30" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Описание</label>
                <input name="description" placeholder="Угловой офис, окна на юг…" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function EditSpaceDialog({ space, floors }: { space: Space; floors: Floor[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
        <Edit2 className="h-3 w-3" />
        Изменить
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold">Редактировать помещение</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    await updateSpace(space.id, fd)
                    toast.success("Изменения сохранены")
                    setOpen(false)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
                  }
                })
              }
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Номер</label>
                  <input name="number" defaultValue={space.number} required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Площадь, м²</label>
                  <input name="area" type="number" step="0.1" defaultValue={space.area} required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Статус</label>
                <select name="status" defaultValue={space.status} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Описание</label>
                <input name="description" defaultValue={space.description ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function DeleteSpaceButton({ spaceId, hasТenant }: { spaceId: string; hasТenant: boolean }) {
  const [, startTransition] = useTransition()

  if (hasТenant) return null

  return (
    <ConfirmDialog
      title="Удалить помещение?"
      description="Это действие нельзя отменить."
      variant="danger"
      confirmLabel="Удалить"
      onConfirm={() =>
        new Promise<void>((resolve) => {
          startTransition(async () => {
            try {
              await deleteSpace(spaceId)
              toast.success("Помещение удалено")
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Не удалось удалить")
            } finally {
              resolve()
            }
          })
        })
      }
      trigger={
        <button className="text-xs text-red-400 hover:text-red-600">
          <Trash2 className="h-3 w-3" />
        </button>
      }
    />
  )
}
