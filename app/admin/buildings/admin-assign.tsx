"use client"

import { useState, useTransition } from "react"
import { Shield, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { setBuildingAdministrator } from "@/app/actions/building"
import { useT } from "@/lib/i18n/client"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Candidate = { id: string; name: string; email: string | null; phone: string | null; role: string }

export function BuildingAdminAssign({
  buildingId,
  current,
  candidates,
}: {
  buildingId: string
  current: { id: string; name: string; email: string | null; phone: string | null } | null
  candidates: Candidate[]
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const apply = (userId: string | null) => {
    startTransition(async () => {
      try {
        await setBuildingAdministrator(buildingId, userId)
        toast.success(userId ? t("adminObjects.adminAssign.assigned") : t("adminObjects.adminAssign.removed"))
        setOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminObjects.adminAssign.failed"))
      }
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1.5 text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20 px-2 py-1 rounded-md font-medium transition-colors"
        title={t("adminObjects.adminAssign.triggerHint")}
      >
        <Shield className="h-3 w-3" />
        {current ? current.name : t("adminObjects.adminAssign.trigger")}
        <ChevronDown className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 overflow-hidden p-0">
        <div>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t("adminObjects.adminAssign.title")}</p>
            <button onClick={() => setOpen(false)} aria-label={t("adminObjects.adminAssign.close")} className="text-xs text-slate-400 hover:text-slate-600">×</button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {current && (
              <button
                onClick={() => apply(null)}
                disabled={pending}
                className="w-full text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 border-b border-slate-100 dark:border-slate-800"
              >
                ✕ {t("adminObjects.adminAssign.remove")}
              </button>
            )}
            {candidates.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                {t("adminObjects.adminAssign.noCandidates")}
              </p>
            ) : (
              candidates.map((u) => {
                const isCurrent = current?.id === u.id
                return (
                  <button
                    key={u.id}
                    onClick={() => !isCurrent && apply(u.id)}
                    disabled={pending || isCurrent}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 last:border-0 ${
                      isCurrent ? "bg-violet-50 dark:bg-violet-500/10" : ""
                    }`}
                  >
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      {u.name}
                      {isCurrent && <span className="ml-1 text-violet-600 dark:text-violet-400">✓</span>}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {u.role === "OWNER" ? t("adminObjects.adminAssign.roleOwner") : t("adminObjects.adminAssign.roleAdmin")}
                      {u.email ? ` · ${u.email}` : ""}
                      {u.phone ? ` · ${u.phone}` : ""}
                    </p>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
