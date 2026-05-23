"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Save, X, Plus } from "lucide-react"
import {
  updateFoundersState,
  releaseFoundersSlot,
  grantFoundersSlot,
} from "@/app/actions/superadmin-founders"

export function FoundersStateForm({
  isActive,
  totalSlots,
  discountPct,
}: {
  isActive: boolean
  totalSlots: number
  discountPct: number
}) {
  const [active, setActive] = useState(isActive)
  const [slots, setSlots] = useState(totalSlots)
  const [pct, setPct] = useState(discountPct)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const r = await updateFoundersState({
        isActive: active,
        totalSlots: slots,
        discountPct: pct,
      })
      if (r.ok) toast.success("Настройки программы сохранены")
      else toast.error(r.error ?? "Не удалось сохранить")
    })
  }

  const dirty = active !== isActive || slots !== totalSlots || pct !== discountPct

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Статус</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActive(!active)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
              active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                active ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {active ? "программа активна" : "выключена"}
          </span>
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Всего слотов</span>
        <input
          type="number"
          min={1}
          max={1000}
          value={slots}
          onChange={(e) => setSlots(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Скидка lifetime, %</span>
        <input
          type="number"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100"
        />
      </label>

      <div className="sm:col-span-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить
        </button>
      </div>
    </div>
  )
}

export function ReleaseSlotButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [pending, startTransition] = useTransition()
  function onClick() {
    if (!confirm(`Снять статус Founders с «${orgName}»? Слот будет освобождён.`)) return
    startTransition(async () => {
      const r = await releaseFoundersSlot(orgId)
      if (r.ok) toast.success("Статус Founders снят")
      else toast.error(r.error ?? "Не удалось")
    })
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
      Снять
    </button>
  )
}

export function GrantSlotButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [pending, startTransition] = useTransition()
  function onClick() {
    if (!confirm(`Выдать статус Founders «${orgName}»? Это пожизненная скидка.`)) return
    startTransition(async () => {
      const r = await grantFoundersSlot(orgId)
      if (r.ok) toast.success(`Founder #${r.slotNumber ?? "?"} выдан`)
      else toast.error(r.error ?? "Не удалось")
    })
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      Выдать
    </button>
  )
}
