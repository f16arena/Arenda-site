"use client"

import { useState, useTransition } from "react"
import { Ban, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { setTenantBlacklist } from "@/app/actions/tenant"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatDateShortL } from "@/lib/i18n/format"

export function BlacklistButton({
  tenantId,
  companyName,
  blacklistedAt,
  blacklistReason,
}: {
  tenantId: string
  companyName: string
  blacklistedAt: Date | string | null
  blacklistReason: string | null
}) {
  const { t } = useT()
  const locale = useLocale()
  const [pending, startTransition] = useTransition()
  const isBlacklisted = !!blacklistedAt
  const [showAddForm, setShowAddForm] = useState(false)

  const performAdd = (reason: string) => {
    startTransition(async () => {
      try {
        await setTenantBlacklist(tenantId, { reason })
        toast.success(t("adminTenants.blacklist.added", { name: companyName }))
        setShowAddForm(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminTenants.blacklist.error"))
      }
    })
  }

  const performRemove = () => {
    startTransition(async () => {
      try {
        await setTenantBlacklist(tenantId, null)
        toast.success(t("adminTenants.blacklist.removed"))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminTenants.blacklist.error"))
      }
    })
  }

  if (isBlacklisted) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Ban className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-semibold text-red-900 dark:text-red-200">{t("adminTenants.blacklist.title")}</p>
            <p className="text-red-800 dark:text-red-200 mt-0.5">
              {blacklistReason ?? t("adminTenants.blacklist.noReason")}
            </p>
            {blacklistedAt && (
              <p className="text-red-600 dark:text-red-400 text-[10px] mt-0.5">
                {t("adminTenants.blacklist.since", { date: formatDateShortL(locale, blacklistedAt) })}
              </p>
            )}
          </div>
        </div>
        <ConfirmDialog
          title={t("adminTenants.blacklist.removeTitle", { name: companyName })}
          description={t("adminTenants.blacklist.removeText")}
          confirmLabel={t("adminTenants.blacklist.removeLabel")}
          onConfirm={performRemove}
          trigger={
            <button
              disabled={pending}
              className="w-full text-xs rounded-md bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-700 dark:text-red-300 px-3 py-1.5 font-medium disabled:opacity-50"
            >
              <ShieldCheck className="inline h-3.5 w-3.5 mr-1" />
              {pending ? t("adminTenants.blacklist.removing") : t("adminTenants.blacklist.removeButton")}
            </button>
          }
        />
      </div>
    )
  }

  if (!showAddForm) {
    return (
      <button
        onClick={() => setShowAddForm(true)}
        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 hover:underline inline-flex items-center gap-1"
      >
        <Ban className="h-3 w-3" />
        {t("adminTenants.blacklist.add")}
      </button>
    )
  }

  return (
    <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{t("adminTenants.blacklist.reason")}</p>
      <textarea
        id={`bl-reason-${tenantId}`}
        rows={2}
        placeholder={t("adminTenants.blacklist.reasonPlaceholder")}
        className="w-full rounded border border-amber-200 dark:border-amber-500/30 px-2 py-1 text-xs bg-white dark:bg-slate-900"
      />
      <div className="flex gap-2">
        <button
          onClick={() => setShowAddForm(false)}
          className="flex-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1 text-slate-600 dark:text-slate-400"
        >
          {t("common.actions.cancel")}
        </button>
        <ConfirmDialog
          variant="danger"
          title={t("adminTenants.blacklist.addTitle", { name: companyName })}
          description={t("adminTenants.blacklist.addText")}
          confirmLabel={t("adminTenants.blacklist.addLabel")}
          onConfirm={() => {
            const ta = document.getElementById(`bl-reason-${tenantId}`) as HTMLTextAreaElement | null
            performAdd(ta?.value ?? "")
          }}
          trigger={
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              className="flex-1 font-medium"
            >
              {pending ? "..." : t("adminTenants.blacklist.addLabel")}
            </Button>
          }
        />
      </div>
    </div>
  )
}
