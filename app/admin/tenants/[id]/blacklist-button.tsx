"use client"

import { useState, useTransition } from "react"
import { Ban, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { setTenantBlacklist } from "@/app/actions/tenant"

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
  const [pending, startTransition] = useTransition()
  const isBlacklisted = !!blacklistedAt
  const [showAddForm, setShowAddForm] = useState(false)

  const handleAdd = (reason: string) => {
    if (!window.confirm(
      `Добавить «${companyName}» в чёрный список?\n\n` +
      `Причина: ${reason || "Без причины"}\n\n` +
      `Это не разрывает договор, но при попытке завести нового арендатора с тем же БИН/ИИН система предупредит.`,
    )) return
    startTransition(async () => {
      try {
        await setTenantBlacklist(tenantId, { reason })
        toast.success(`«${companyName}» добавлен в чёрный список`)
        setShowAddForm(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка")
      }
    })
  }

  const handleRemove = () => {
    if (!window.confirm(`Снять «${companyName}» с чёрного списка?`)) return
    startTransition(async () => {
      try {
        await setTenantBlacklist(tenantId, null)
        toast.success("Снят с чёрного списка")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка")
      }
    })
  }

  if (isBlacklisted) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Ban className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-semibold text-red-900 dark:text-red-200">В чёрном списке</p>
            <p className="text-red-800 dark:text-red-200 mt-0.5">
              {blacklistReason ?? "Без причины"}
            </p>
            {blacklistedAt && (
              <p className="text-red-600 dark:text-red-400 text-[10px] mt-0.5">
                с {new Date(blacklistedAt).toLocaleDateString("ru-RU")}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleRemove}
          disabled={pending}
          className="w-full text-xs rounded-md bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-700 dark:text-red-300 px-3 py-1.5 font-medium disabled:opacity-50"
        >
          <ShieldCheck className="inline h-3.5 w-3.5 mr-1" />
          {pending ? "Снятие..." : "Снять с чёрного списка"}
        </button>
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
        Добавить в чёрный список
      </button>
    )
  }

  return (
    <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Причина блокировки</p>
      <textarea
        id={`bl-reason-${tenantId}`}
        rows={2}
        placeholder="Не платил, повредил имущество, и т.д."
        className="w-full rounded border border-amber-200 dark:border-amber-500/30 px-2 py-1 text-xs bg-white dark:bg-slate-900"
      />
      <div className="flex gap-2">
        <button
          onClick={() => setShowAddForm(false)}
          className="flex-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1 text-slate-600 dark:text-slate-400"
        >
          Отмена
        </button>
        <button
          onClick={() => {
            const ta = document.getElementById(`bl-reason-${tenantId}`) as HTMLTextAreaElement | null
            handleAdd(ta?.value ?? "")
          }}
          disabled={pending}
          className="flex-1 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white px-3 py-1 font-medium disabled:opacity-50"
        >
          {pending ? "..." : "В чёрный список"}
        </button>
      </div>
    </div>
  )
}
