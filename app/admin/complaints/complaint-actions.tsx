"use client"

import { useState, useTransition } from "react"
import { MessageSquare, CheckCircle } from "lucide-react"
import { respondToComplaint, resolveComplaint } from "@/app/actions/complaints"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n/client"

export function RespondButton({ complaintId, hasResponse }: { complaintId: string; hasResponse: boolean }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [resolvePending, startResolveTransition] = useTransition()

  return (
    <>
      <div className="flex items-center gap-2 shrink-0">
        {!hasResponse && (
          <button onClick={() => setOpen(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {t("adminService.complaints.respond")}
          </button>
        )}
        {hasResponse && (
          <button
            onClick={() => startResolveTransition(async () => { await resolveComplaint(complaintId) })}
            disabled={resolvePending}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 disabled:opacity-50"
          >
            <CheckCircle className="h-3 w-3" />
            {resolvePending ? "…" : t("adminService.complaints.markResolved")}
          </button>
        )}
        {hasResponse && (
          <button onClick={() => setOpen(true)} className="text-xs text-slate-500 dark:text-slate-400 hover:underline flex items-center gap-1">
            {t("adminService.complaints.editResponse")}
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("adminService.complaints.respondTitle")}</DialogTitle>
          </DialogHeader>
          <form
            action={(fd) => startTransition(async () => { await respondToComplaint(complaintId, fd); setOpen(false) })}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminService.complaints.responseLabel")}</label>
              <Textarea
                name="response"
                required
                rows={4}
                className="resize-none"
                placeholder={t("adminService.complaints.responsePlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
              <Button type="submit" loading={pending} className="flex-1">
                {pending ? t("common.actions.sending") : t("adminService.complaints.respond")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
