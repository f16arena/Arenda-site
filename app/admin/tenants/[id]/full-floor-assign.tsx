"use client"

import { useState, useTransition } from "react"
import { Layers, X } from "lucide-react"
import { toast } from "sonner"
import { assignFullFloor, unassignFullFloor } from "@/app/actions/floor-assignment"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { CollapsibleCard } from "@/components/ui/collapsible-card"

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
  const availableFloors = floors.filter((f) => !f.fullFloorTenantId)
  const [open, setOpen] = useState(false)
  const [floorId, setFloorId] = useState(availableFloors[0]?.id ?? "")
  const [rent, setRent] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <CollapsibleCard
      title="Аренда целого этажа"
      icon={Layers}
      meta={currentFloors.length > 0 ? `${currentFloors.length} назначено` : "не назначено"}
    >
      <div className="p-4">
        {availableFloors.length > 0 && (
          <button
            onClick={() => setOpen(true)}
            className="mb-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Назначить
          </button>
        )}

        {currentFloors.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">Не назначено</p>
        )}

        {currentFloors.map((f) => (
          <div key={f.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{f.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{f.fixedMonthlyRent?.toLocaleString("ru-RU")} ₸/мес</p>
              </div>
            </div>
            <ConfirmDialog
              title="Снять с этажа?"
              description="Этаж освободится. Помещения с индивидуальными арендаторами останутся."
              variant="danger"
              confirmLabel="Снять"
              onConfirm={() =>
                new Promise<void>((resolve) => {
                  startTransition(async () => {
                    try {
                      await unassignFullFloor(f.id)
                      toast.success("Снят с этажа")
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Ошибка")
                    } finally {
                      resolve()
                    }
                  })
                })
              }
              trigger={<button className="text-xs text-red-500 hover:underline">Снять</button>}
            />
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Аренда целого этажа</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Этаж *</label>
                <select
                  value={floorId}
                  onChange={(e) => setFloorId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                >
                  {availableFloors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.totalArea ? ` · ${f.totalArea} м²` : ""}
                      {` · базовая ставка ${f.ratePerSqm.toLocaleString("ru-RU")} ₸/м²`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Сумма аренды ₸/мес *</label>
                <input
                  type="number"
                  step="0.01"
                  value={rent}
                  onChange={(e) => setRent(e.target.value)}
                  placeholder="600000"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Фиксированная сумма независимо от площади</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button
                  disabled={pending || !floorId || !rent}
                  onClick={() => {
                    const parsedRent = Number(rent.replace(",", "."))
                    if (!Number.isFinite(parsedRent) || parsedRent <= 0) {
                      toast.error("Введите корректную сумму аренды за этаж")
                      return
                    }
                    startTransition(async () => {
                      try {
                        await assignFullFloor(floorId, tenantId, parsedRent)
                        toast.success("Этаж назначен")
                        setOpen(false)
                        setRent("")
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Ошибка")
                      }
                    })
                  }}
                  className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60"
                >
                  {pending ? "..." : "Назначить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </CollapsibleCard>
  )
}
