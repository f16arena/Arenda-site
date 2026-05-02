"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateFloor } from "@/app/actions/building"

export function FloorSettingsForm({
  floorId,
  initial,
}: {
  floorId: string
  initial: { name: string; ratePerSqm: number; totalArea: number | null }
}) {
  const [name, setName] = useState(initial.name)
  const [ratePerSqm, setRatePerSqm] = useState(String(initial.ratePerSqm))
  const [totalArea, setTotalArea] = useState(initial.totalArea ? String(initial.totalArea) : "")
  const [pending, startTransition] = useTransition()

  const onSubmit = (formData: FormData) => {
    formData.set("name", name)
    formData.set("ratePerSqm", ratePerSqm)
    formData.set("totalArea", totalArea)
    startTransition(async () => {
      try {
        await updateFloor(floorId, formData)
        toast.success("Настройки этажа сохранены")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
      }
    })
  }

  return (
    <form action={onSubmit} className="p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Название этажа *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="1 этаж / Подвал / Цокольный"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Ставка ₸/м²/мес
          </label>
          <input
            type="number"
            step="0.01"
            value={ratePerSqm}
            onChange={(e) => setRatePerSqm(e.target.value)}
            placeholder="2500"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Общая площадь этажа (м²)
          <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">из тех. паспорта</span>
        </label>
        <input
          type="number"
          step="0.1"
          min="0"
          value={totalArea}
          onChange={(e) => setTotalArea(e.target.value)}
          placeholder="напр. 250"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
          Складывается с другими этажами в общую площадь здания.
          Не может быть меньше суммы помещений на этаже.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 hover:bg-slate-800 px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </form>
  )
}
