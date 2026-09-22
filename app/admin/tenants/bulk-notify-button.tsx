"use client"

import { useState, useTransition } from "react"
import { Megaphone } from "lucide-react"
import { toast } from "sonner"
import { sendBulkNotificationToTenants } from "@/app/actions/bulk-notify"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n/client"

/**
 * Кнопка «Рассылка арендаторам» + модалка. Если фича недоступна в тарифе —
 * сервер вернёт ошибку, и мы покажем toast со ссылкой на /admin/subscription.
 */
export function BulkNotifyButton({ available, totalTenants }: { available: boolean; totalTenants: number }) {
  const { t } = useT()
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
      toast.error(t("adminTenants.bulkNotify.fillFields"))
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
        toast.success(r.skipped
          ? t("adminTenants.bulkNotify.sentSkipped", { sent: r.sent ?? 0, skipped: r.skipped ?? 0 })
          : t("adminTenants.bulkNotify.sent", { sent: r.sent ?? 0 }))
        setTitle("")
        setMessage("")
        setAlsoEmail(false)
        close()
      } else {
        toast.error(r.error ?? t("adminTenants.bulkNotify.failed"))
      }
    })
  }

  if (!available) {
    // Без фичи — рендерим disabled-кнопку с подсказкой на тариф.
    return (
      <button
        type="button"
        onClick={() => toast.info(t("adminTenants.bulkNotify.lockedToast"))}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-400 dark:text-slate-500"
        title={t("adminTenants.bulkNotify.lockedHint")}
      >
        <Megaphone className="h-4 w-4" />
        {t("adminTenants.bulkNotify.button")}
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
        {t("adminTenants.bulkNotify.button")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("adminTenants.bulkNotify.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {scope === "all"
                ? t("adminTenants.bulkNotify.noteAll", { count: totalTenants })
                : t("adminTenants.bulkNotify.noteDebtors")}
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("adminTenants.bulkNotify.scope")}</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value === "debtors" ? "debtors" : "all")}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="all">{t("adminTenants.bulkNotify.scopeAll")}</option>
                <option value="debtors">{t("adminTenants.bulkNotify.scopeDebtors")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("adminTenants.bulkNotify.subject")}</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder={t("adminTenants.bulkNotify.subjectPlaceholder")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("adminTenants.bulkNotify.message")}</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={1500}
                placeholder={t("adminTenants.bulkNotify.messagePlaceholder")}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)} />
              {t("adminTenants.bulkNotify.alsoEmail")}
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>{t("common.actions.cancel")}</Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending || !title.trim() || !message.trim()}
              loading={pending}
              leftIcon={<Megaphone className="h-4 w-4" />}
            >
              {pending
                ? t("adminTenants.bulkNotify.sending")
                : scope === "all"
                  ? t("adminTenants.bulkNotify.submitAll", { count: totalTenants })
                  : t("adminTenants.bulkNotify.submitDebtors")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
