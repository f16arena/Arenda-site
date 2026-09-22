"use client"

import { useState, useTransition } from "react"
import { Plus } from "lucide-react"
import { createTask } from "@/app/actions/tasks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n/client"

type StaffUser = { id: string; name: string }
type BuildingOption = { id: string; name: string }

const CATEGORY_KEYS = ["REPAIR", "PLUMBING", "ELECTRICAL", "CLEANING", "SECURITY", "OTHER"] as const
const PRIORITY_KEYS = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const
// Этажи в форме перечислены заранее: подвал и первые три этажа.
const FLOOR_VALUES = [1, 2, 3] as const

export function TaskDialog({
  staffUsers,
  buildings = [],
  currentBuildingId,
}: {
  staffUsers: StaffUser[]
  buildings?: BuildingOption[]
  currentBuildingId?: string | null
}) {
  const { t } = useT()
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
        {t("adminService.tasks.dialog.create")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("adminService.tasks.dialog.title")}</DialogTitle>
          </DialogHeader>

          <form action={handleSubmit} className="space-y-4">
            {currentBuildingId ? (
              <input type="hidden" name="buildingId" value={currentBuildingId} />
            ) : buildings.length === 1 ? (
              <input type="hidden" name="buildingId" value={buildings[0].id} />
            ) : buildings.length > 1 ? (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.tasks.dialog.building")} *</label>
                <select name="buildingId" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="">{t("adminService.tasks.dialog.selectBuilding")}</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.tasks.dialog.name")} *</label>
              <Input name="title" required placeholder={t("adminService.tasks.dialog.namePlaceholder")} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.tasks.dialog.description")}</label>
              <Textarea
                name="description"
                rows={3}
                placeholder={t("adminService.tasks.dialog.descriptionPlaceholder")}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.tasks.dialog.category")}</label>
                <select name="category" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  {CATEGORY_KEYS.map((key) => (
                    <option key={key} value={key}>{t(`adminService.tasks.categories.${key}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.tasks.dialog.priority")}</label>
                <select name="priority" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  {PRIORITY_KEYS.map((key) => (
                    <option key={key} value={key}>{t(`adminService.tasks.dialog.priorities.${key}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.tasks.dialog.floor")}</label>
                <select name="floorNumber" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="">—</option>
                  <option value="-1">{t("adminService.tasks.dialog.floorBasement")}</option>
                  {FLOOR_VALUES.map((number) => (
                    <option key={number} value={number}>{t("adminService.tasks.dialog.floorNumber", { number })}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.tasks.dialog.space")}</label>
                <Input name="spaceNumber" placeholder={t("adminService.tasks.dialog.spacePlaceholder")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.tasks.dialog.assignee")}</label>
                <select name="assignedToId" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="">{t("adminService.tasks.dialog.unassigned")}</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.tasks.dialog.due")}</label>
                <Input name="dueDate" type="date" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.tasks.dialog.estimatedCost")}</label>
              <Input name="estimatedCost" type="number" step="0.01" placeholder="0" />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1 font-medium"
              >
                {t("common.actions.cancel")}
              </Button>
              <Button
                type="submit"
                loading={pending}
                className="flex-1 font-medium"
              >
                {pending ? t("adminService.tasks.dialog.creating") : t("adminService.tasks.dialog.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
