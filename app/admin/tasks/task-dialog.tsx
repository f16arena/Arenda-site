"use client"

import { useState, useTransition } from "react"
import { Plus } from "lucide-react"
import { createTask } from "@/app/actions/tasks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type StaffUser = { id: string; name: string }
type BuildingOption = { id: string; name: string }

export function TaskDialog({
  staffUsers,
  buildings = [],
  currentBuildingId,
}: {
  staffUsers: StaffUser[]
  buildings?: BuildingOption[]
  currentBuildingId?: string | null
}) {
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
      <Button
        onClick={() => setOpen(true)}
        leftIcon={<Plus className="h-4 w-4" />}
      >
        Создать задачу
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Новая задача</DialogTitle>
          </DialogHeader>

          <form action={handleSubmit} className="space-y-4">
            {currentBuildingId ? (
              <input type="hidden" name="buildingId" value={currentBuildingId} />
            ) : buildings.length === 1 ? (
              <input type="hidden" name="buildingId" value={buildings[0].id} />
            ) : buildings.length > 1 ? (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Здание *</label>
                <select name="buildingId" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="">Выберите здание</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Название *</label>
              <Input name="title" required placeholder="Что нужно сделать?" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Описание</label>
              <Textarea
                name="description"
                rows={3}
                placeholder="Подробности задачи..."
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Категория</label>
                <select name="category" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="REPAIR">Ремонт</option>
                  <option value="PLUMBING">Сантехника</option>
                  <option value="ELECTRICAL">Электрика</option>
                  <option value="CLEANING">Уборка</option>
                  <option value="SECURITY">Безопасность</option>
                  <option value="OTHER">Прочее</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Приоритет</label>
                <select name="priority" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="LOW">Низкий</option>
                  <option value="MEDIUM">Средний</option>
                  <option value="HIGH">Высокий</option>
                  <option value="URGENT">Срочный</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Этаж</label>
                <select name="floorNumber" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="">—</option>
                  <option value="-1">Подвал</option>
                  <option value="1">1 этаж</option>
                  <option value="2">2 этаж</option>
                  <option value="3">3 этаж</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Кабинет</label>
                <Input name="spaceNumber" placeholder="101, 202..." />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Исполнитель</label>
                <select name="assignedToId" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="">Не назначен</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Срок</label>
                <Input name="dueDate" type="date" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Планируемые расходы, ₸</label>
              <Input name="estimatedCost" type="number" step="0.01" placeholder="0" />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1 font-medium"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                loading={pending}
                className="flex-1 font-medium"
              >
                {pending ? "Создание..." : "Создать задачу"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
