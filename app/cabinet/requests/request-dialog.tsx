"use client"

import { useState, useTransition } from "react"
import { ImagePlus, Plus } from "lucide-react"
import { createRequestTenant } from "@/app/actions/requests"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n/client"

export function RequestDialog() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        {t("cabinetSupport.requests.dialog.title")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cabinetSupport.requests.dialog.title")}</DialogTitle>
          </DialogHeader>
          <form
            action={(fd) => startTransition(async () => {
              const result = await createRequestTenant(fd)
              if ("error" in result && result.error) {
                toast.error(result.error)
                return
              }
              toast.success(t("cabinetSupport.requests.dialog.sent"))
              setOpen(false)
            })}
            encType="multipart/form-data"
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("cabinetSupport.requests.dialog.subject")} *</label>
              <Input name="title" required placeholder={t("cabinetSupport.requests.dialog.subjectPlaceholder")} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("cabinetSupport.requests.dialog.description")}</label>
              <Textarea name="description" rows={4} placeholder={t("cabinetSupport.requests.dialog.descriptionPlaceholder")} className="resize-none" />
            </div>
            <label className="block rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <span className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                <ImagePlus className="h-4 w-4 text-teal-500" />
                {t("cabinetSupport.requests.dialog.attach")}
              </span>
              <input
                name="attachment"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="mt-2 block w-full cursor-pointer text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700 dark:text-slate-400 dark:file:bg-slate-800 dark:file:text-slate-200"
              />
              <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
                {t("cabinetSupport.requests.dialog.attachHint")}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("cabinetSupport.requests.dialog.type")}</label>
                <select name="type" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="TECHNICAL">{t("cabinetSupport.requests.types.TECHNICAL")}</option>
                  <option value="INTERNET">{t("cabinetSupport.requests.types.INTERNET")}</option>
                  <option value="CLEANING">{t("cabinetSupport.requests.types.CLEANING")}</option>
                  <option value="QUESTION">{t("cabinetSupport.requests.types.QUESTION")}</option>
                  <option value="OTHER">{t("cabinetSupport.requests.types.OTHER")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("cabinetSupport.requests.dialog.priority")}</label>
                <select name="priority" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none bg-white dark:bg-slate-900">
                  <option value="LOW">{t("cabinetSupport.requests.priorities.LOW")}</option>
                  <option value="MEDIUM">{t("cabinetSupport.requests.priorities.MEDIUM")}</option>
                  <option value="HIGH">{t("cabinetSupport.requests.priorities.HIGH")}</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
              <Button type="submit" loading={pending} className="flex-1">
                {pending ? t("cabinetSupport.requests.dialog.submitting") : t("cabinetSupport.requests.dialog.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
