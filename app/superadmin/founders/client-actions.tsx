"use client"
import { askConfirm } from "@/components/ui/dialog-host"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Save, X, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  updateFoundersState,
  releaseFoundersSlot,
  grantFoundersSlot,
} from "@/app/actions/superadmin-founders"
import { useT } from "@/lib/i18n/client"

export function FoundersStateForm({
  isActive,
  totalSlots,
  discountPct,
}: {
  isActive: boolean
  totalSlots: number
  discountPct: number
}) {
  const { t } = useT()
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
      if (r.ok) toast.success(t("superadmin.founders.saved"))
      else toast.error(r.error ?? t("superadmin.founders.saveFailed"))
    })
  }

  const dirty = active !== isActive || slots !== totalSlots || pct !== discountPct

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("superadmin.founders.fieldStatus")}</span>
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
            {active ? t("superadmin.founders.toggleActive") : t("superadmin.founders.toggleOff")}
          </span>
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("superadmin.founders.fieldSlots")}</span>
        <Input
          type="number"
          min={1}
          max={1000}
          value={slots}
          onChange={(e) => setSlots(Number(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("superadmin.founders.fieldDiscount")}</span>
        <Input
          type="number"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
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
          {t("common.actions.save")}
        </button>
      </div>
    </div>
  )
}

export function ReleaseSlotButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  async function onClick() {
    const ok = await askConfirm({
      title: t("superadmin.founders.releaseTitle", { name: orgName }),
      description: t("superadmin.founders.releaseDescription"),
      danger: true,
    })
    if (!ok) return
    startTransition(async () => {
      const r = await releaseFoundersSlot(orgId)
      if (r.ok) toast.success(t("superadmin.founders.released"))
      else toast.error(r.error ?? t("superadmin.founders.failed"))
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
      {t("superadmin.founders.release")}
    </button>
  )
}

export function GrantSlotButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  async function onClick() {
    const ok = await askConfirm({
      title: t("superadmin.founders.grantConfirmTitle", { name: orgName }),
      description: t("superadmin.founders.grantConfirmDescription"),
    })
    if (!ok) return
    startTransition(async () => {
      const r = await grantFoundersSlot(orgId)
      if (r.ok) toast.success(t("superadmin.founders.granted", { number: r.slotNumber ?? "?" }))
      else toast.error(r.error ?? t("superadmin.founders.failed"))
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
      {t("superadmin.founders.grant")}
    </button>
  )
}
