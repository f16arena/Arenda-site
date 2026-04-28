"use client"

import { useState, useTransition } from "react"
import { Plus, X } from "lucide-react"
import { createTask } from "@/app/actions/tasks"

type StaffUser = { id: string; name: string }

export function TaskDialog({ staffUsers }: { staffUsers: StaffUser[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await createTask(formData)
      setOpen(false)
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Создать задачу
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Новая задача</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form action={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Название *</label>
                <input
                  name="title"
                  required
                  placeholder="Что нужно сделать?"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Описание</label>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Подробности задачи..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Категория</label>
                  <select name="category" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                    <option value="REPAIR">Ремонт</option>
                    <option value="PLUMBING">Сантехника</option>
                    <option value="ELECTRICAL">Электрика</option>
                    <option value="CLEANING">Уборка</option>
                    <option value="SECURITY">Безопасность</option>
                    <option value="OTHER">Прочее</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Приоритет</label>
                  <select name="priority" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                    <option value="LOW">Низкий</option>
                    <option value="MEDIUM">Средний</option>
                    <option value="HIGH">Высокий</option>
                    <option value="URGENT">Срочный</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Этаж</label>
                  <select name="floorNumber" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                    <option value="">—</option>
                    <option value="-1">Подвал</option>
                    <option value="1">1 этаж</option>
                    <option value="2">2 этаж</option>
                    <option value="3">3 этаж</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Кабинет</label>
                  <input name="spaceNumber" placeholder="101, 202..." className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Исполнитель</label>
                  <select name="assignedToId" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                    <option value="">Не назначен</option>
                    {staffUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Срок</label>
                  <input name="dueDate" type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Планируемые расходы, ₸</label>
                <input name="estimatedCost" type="number" step="0.01" placeholder="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {pending ? "Создание..." : "Создать задачу"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
