"use client"

import { useState, useTransition } from "react"
import { Megaphone } from "lucide-react"
import { toast } from "sonner"
import { sendBulkNotificationToTenants } from "@/app/actions/bulk-notify"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

/**
 * Кнопка «Рассылка арендаторам» + модалка. Если фича недоступна в тарифе —
 * сервер вернёт ошибку, и мы покажем toast со ссылкой на /admin/subscription.
 */
export function BulkNotifyButton({ available, totalTenants }: { available: boolean; totalTenants: number }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [alsoEmail, setAlsoEmail] = useState(false)
  const [scope, setScope] = useState<"all" | "debtors">("all")
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
        scope,
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
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <Megaphone className="h-4 w-4" />
        Рассылка
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Рассылка арендаторам</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {scope === "all"
                ? <>Уведомление получат <b>все {totalTenants} арендаторов</b> текущей организации (в колокольчике; письмо — по галочке).</>
                : <>Уведомление получат <b>только арендаторы с неоплаченными начислениями</b> (в колокольчике; письмо — по галочке).</>}
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Кому</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value === "debtors" ? "debtors" : "all")}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Всем арендаторам</option>
                <option value="debtors">Только должникам (есть неоплаченные начисления)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Заголовок</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Напр.: Изменение реквизитов"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Текст</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={1500}
                placeholder="Текст сообщения для арендаторов…"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)} />
              Также отправить email
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Отмена</Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending || !title.trim() || !message.trim()}
              loading={pending}
              leftIcon={<Megaphone className="h-4 w-4" />}
            >
              {pending ? "Отправляю…" : scope === "all" ? `Отправить ${totalTenants}` : "Отправить должникам"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
