"use client"

import { useState, useTransition } from "react"
import { Trash2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { deleteTenant, getTenantDeleteBlockers } from "@/app/actions/tenant"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useT } from "@/lib/i18n/client"

type Blockers = Awaited<ReturnType<typeof getTenantDeleteBlockers>>

export function DeleteTenantButton({
  tenantId,
  companyName,
  redirectAfter,
}: {
  tenantId: string
  companyName: string
  redirectAfter?: boolean
}) {
  const { t, tp } = useT()
  const [open, setOpen] = useState(false)
  const [blockers, setBlockers] = useState<Blockers | null>(null)
  const [pending, startTransition] = useTransition()

  const openDialog = async () => {
    setOpen(true)
    setBlockers(null)
    try {
      const b = await getTenantDeleteBlockers(tenantId)
      setBlockers(b)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("adminTenants.remove.checkFailed"))
      setOpen(false)
    }
  }

  const items = blockers
    ? [
        { label: t("adminTenants.remove.items.charges"), count: blockers.charges },
        { label: t("adminTenants.remove.items.payments"), count: blockers.payments },
        { label: t("adminTenants.remove.items.contracts"), count: blockers.contracts },
        { label: t("adminTenants.remove.items.documents"), count: blockers.documents },
        { label: t("adminTenants.remove.items.requests"), count: blockers.requests },
        { label: t("adminTenants.remove.items.fullFloors"), count: blockers.fullFloors },
      ].filter((x) => x.count > 0)
    : []

  const totalLinks = items.reduce((s, x) => s + x.count, 0)
  const hasLinks = items.length > 0
  const hasSpace = blockers?.hasSpace ?? false

  const handleDelete = (force: boolean) => {
    startTransition(async () => {
      try {
        await deleteTenant(tenantId, { redirectAfter, force })
        toast.success(t("adminTenants.remove.deleted", { name: companyName }))
        setOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminTenants.remove.failed"))
      }
    })
  }

  return (
    <>
      <button
        onClick={openDialog}
        className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {t("adminTenants.remove.button")}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Пока идёт удаление — Esc и клик мимо не закрывают окно.
          if (pending) return
          setOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <DialogTitle>{t("adminTenants.remove.title")}</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <b>«{companyName}»</b>
            </p>

            {!blockers ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("adminTenants.remove.checking")}</p>
            ) : (
              <>
                {hasSpace && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    {t("adminTenants.remove.hasSpace")}
                  </div>
                )}

                {hasLinks ? (
                  <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 space-y-2">
                    <p className="text-xs font-medium text-red-800 dark:text-red-200">
                      {tp("adminTenants.remove.linked", totalLinks)}
                    </p>
                    <ul className="space-y-0.5 text-xs">
                      {items.map((x) => (
                        <li key={x.label} className="flex items-center justify-between text-red-700 dark:text-red-300">
                          <span>• {x.label}</span>
                          <b className="tabular-nums">{x.count}</b>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-red-600 dark:text-red-400 pt-1 border-t border-red-200 dark:border-red-500/20">
                      {t("adminTenants.remove.cascadeWarning")}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg px-3 py-2">
                    {t("adminTenants.remove.clean")}
                  </p>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="flex-1"
            >
              {t("common.actions.cancel")}
            </Button>
            {blockers && !hasLinks && (
              <Button
                variant="danger"
                onClick={() => handleDelete(false)}
                loading={pending}
                className="flex-1 font-medium"
              >
                {pending ? t("adminTenants.remove.deleting") : t("common.actions.delete")}
              </Button>
            )}
            {blockers && hasLinks && (
              <Button
                variant="danger"
                onClick={() => handleDelete(true)}
                loading={pending}
                className="flex-1 font-medium"
              >
                {pending
                  ? t("adminTenants.remove.deleting")
                  : t("adminTenants.remove.deleteWithLinks", { count: totalLinks })}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
