"use client"

import { useState, useTransition } from "react"
import { Layers } from "lucide-react"
import { toast } from "sonner"
import { assignFullFloor, unassignFullFloor } from "@/app/actions/floor-assignment"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatNumberL } from "@/lib/i18n/format"

type Floor = {
  id: string
  name: string
  totalArea: number | null
  ratePerSqm: number
  fullFloorTenantId: string | null
}

export function FullFloorAssign({
  tenantId,
  floors,
  currentFloors,
}: {
  tenantId: string
  floors: Floor[]
  currentFloors: { id: string; name: string; fixedMonthlyRent: number | null }[]
}) {
  const { t } = useT()
  const locale = useLocale()
  const availableFloors = floors.filter((f) => !f.fullFloorTenantId)
  const [open, setOpen] = useState(false)
  const [floorId, setFloorId] = useState(availableFloors[0]?.id ?? "")
  const [rent, setRent] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <CollapsibleCard
      title={t("adminTenants.fullFloor.title")}
      icon={Layers}
      meta={currentFloors.length > 0
        ? t("adminTenants.fullFloor.metaAssigned", { count: currentFloors.length })
        : t("adminTenants.fullFloor.metaEmpty")}
    >
      <div className="p-4">
        {availableFloors.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mb-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t("adminTenants.fullFloor.assign")}
          </button>
        )}

        {currentFloors.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">{t("adminTenants.fullFloor.empty")}</p>
        )}

        {currentFloors.map((f) => (
          <div key={f.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{f.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("adminTenants.fullFloor.rentPerMonth", { amount: formatNumberL(locale, f.fixedMonthlyRent ?? 0) })}
                </p>
              </div>
            </div>
            <ConfirmDialog
              title={t("adminTenants.fullFloor.unassignTitle")}
              description={t("adminTenants.fullFloor.unassignText")}
              variant="danger"
              confirmLabel={t("adminTenants.fullFloor.unassign")}
              onConfirm={() =>
                new Promise<void>((resolve) => {
                  startTransition(async () => {
                    try {
                      await unassignFullFloor(f.id)
                      toast.success(t("adminTenants.fullFloor.unassigned"))
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : t("adminTenants.fullFloor.error"))
                    } finally {
                      resolve()
                    }
                  })
                })
              }
              trigger={<button className="text-xs text-red-500 hover:underline">{t("adminTenants.fullFloor.unassign")}</button>}
            />
          </div>
        ))}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Пока идёт назначение — Esc и клик мимо не закрывают окно.
          if (pending) return
          setOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("adminTenants.fullFloor.title")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.fullFloor.floor")}</label>
              <select
                value={floorId}
                onChange={(e) => setFloorId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
              >
                {availableFloors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.totalArea ? ` · ${f.totalArea} м²` : ""}
                    {t("adminTenants.fullFloor.floorRate", { rate: formatNumberL(locale, f.ratePerSqm) })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.fullFloor.rent")}</label>
              <Input
                type="number"
                step="0.01"
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                placeholder="600000"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{t("adminTenants.fullFloor.rentHint")}</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending} className="flex-1">
              {t("common.actions.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!floorId || !rent}
              loading={pending}
              onClick={() => {
                const parsedRent = Number(rent.replace(",", "."))
                if (!Number.isFinite(parsedRent) || parsedRent <= 0) {
                  toast.error(t("adminTenants.fullFloor.badRent"))
                  return
                }
                startTransition(async () => {
                  try {
                    await assignFullFloor(floorId, tenantId, parsedRent)
                    toast.success(t("adminTenants.fullFloor.assigned"))
                    setOpen(false)
                    setRent("")
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : t("adminTenants.fullFloor.error"))
                  }
                })
              }}
              className="flex-1"
            >
              {pending ? "..." : t("adminTenants.fullFloor.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleCard>
  )
}
