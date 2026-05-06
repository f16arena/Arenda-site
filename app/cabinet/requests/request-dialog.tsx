"use client"

import { useState, useTransition } from "react"
import { ImagePlus, Plus, X } from "lucide-react"
import { createRequestTenant } from "@/app/actions/requests"
import { toast } from "sonner"

export function RequestDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Новая заявка
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:max-w-md sm:rounded-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Новая заявка</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              action={(fd) => startTransition(async () => {
                const result = await createRequestTenant(fd)
                if ("error" in result && result.error) {
                  toast.error(result.error)
                  return
                }
                toast.success("Заявка отправлена администратору")
                setOpen(false)
              })}
              encType="multipart/form-data"
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Тема обращения *</label>
                <input name="title" required placeholder="Кратко опишите проблему" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Описание</label>
                <textarea name="description" rows={4} placeholder="Подробности..." className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none resize-none" />
              </div>
              <label className="block rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <span className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <ImagePlus className="h-4 w-4 text-teal-500" />
                  Фото или файл к заявке
                </span>
                <input
                  name="attachment"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="mt-2 block w-full cursor-pointer text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700 dark:text-slate-400 dark:file:bg-slate-800 dark:file:text-slate-200"
                />
                <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
                  JPG, PNG, WebP или PDF до 5 МБ. Можно сфотографировать проблему с телефона.
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Тип</label>
                  <select name="type" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none bg-white dark:bg-slate-900">
                    <option value="TECHNICAL">Техническая</option>
                    <option value="INTERNET">Интернет</option>
                    <option value="CLEANING">Уборка</option>
                    <option value="QUESTION">Вопрос</option>
                    <option value="OTHER">Прочее</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Приоритет</label>
                  <select name="priority" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none bg-white dark:bg-slate-900">
                    <option value="LOW">Низкий</option>
                    <option value="MEDIUM">Средний</option>
                    <option value="HIGH">Высокий</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-teal-600 py-2 text-sm text-white hover:bg-teal-700 disabled:opacity-60">
                  {pending ? "Отправка..." : "Отправить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
