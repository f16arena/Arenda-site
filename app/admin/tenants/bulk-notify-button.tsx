"use client"

import { useState, useTransition } from "react"
import { Megaphone, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { sendBulkNotificationToTenants } from "@/app/actions/bulk-notify"

/**
 * Кнопка «Рассылка арендаторам» + модалка. Если фича недоступна в тарифе —
 * сервер вернёт ошибку, и мы покажем toast со ссылкой на /admin/subscription.
 */
export function BulkNotifyButton({ available, totalTenants }: { available: boolean; totalTenants: number }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [alsoEmail, setAlsoEmail] = useState(false)
  const [pending, startTransition] = useTransition()

  function close() {
    setOpen(false)
  }

  function submit() {
    if (!title.trim() || !message.trim()) {
      toast.error("Заполните заголовок и текст")
      return
    }
    startTransition(async () => {
      const r = await sendBulkNotificationToTenants({
        scope: "all",
        title,
        message,
        alsoEmail,
      })
      if (r.ok) {
        toast.success(`Рассылка отправлена: ${r.sent} арендаторов${r.skipped ? ` (пропущено ${r.skipped})` : ""}`)
        setTitle("")
        setMessage("")
        setAlsoEmail(false)
        close()
      } else {
        toast.error(r.error ?? "Не удалось отправить")
      }
    })
  }

  if (!available) {
    // Без фичи — рендерим disabled-кнопку с подсказкой на тариф.
    return (
      <button
        type="button"
        onClick={() => toast.info("Массовые рассылки — на тарифе Starter и выше")}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-400 dark:text-slate-500"
        title="Доступно на Starter и выше"
      >
        <Megaphone className="h-4 w-4" />
        Рассылка
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <Megaphone className="h-4 w-4" />
        Рассылка
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Рассылка арендаторам</h3>
              <button onClick={close} aria-label="Закрыть" className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Уведомление получат <b>все {totalTenants} арендаторов</b> текущей организации (в колокольчике; письмо — по галочке).
              </p>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Заголовок</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Напр.: Изменение реквизитов"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Текст</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={1500}
                  placeholder="Текст сообщения для арендаторов…"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)} />
                Также отправить email
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-6 py-4">
              <button onClick={close} className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50">Отмена</button>
              <button
                onClick={submit}
                disabled={pending || !title.trim() || !message.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                {pending ? "Отправляю…" : `Отправить ${totalTenants}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
