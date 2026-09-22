"use client"
import { ModalShell } from "@/components/ui/modal"

import { useState, useTransition } from "react"
import { Plus, X, Gauge } from "lucide-react"
import { saveMeterReading, createMeter } from "@/app/actions/meters"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/client"

type Meter = { id: string; type: string; number: string; space: { number: string } }
type Space = { id: string; number: string; floor: { name: string } }

/** Подпись типа счётчика: свет / вода / тепло — из словаря. */
function useMeterTypeLabel() {
  const { t } = useT()
  return (type: string) => {
    const key = `adminFinance.meters.types.${type}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? type : label
  }
}

export function InlineReadingButton({ meterId, period }: { meterId: string; period: string }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{t("adminFinance.meters.inline.trigger")}</button>

      <ModalShell open={open} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xs">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold">{t("adminFinance.meters.inline.title")}</h2>
              <button onClick={() => setOpen(false)} aria-label={t("common.actions.close")}><X className="h-4 w-4 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) => startTransition(async () => {
                const r = await saveMeterReading(fd)
                if ("error" in r) { setMsg(t("adminFinance.meters.inline.error", { message: r.error ?? "" })) }
                else {
                  setMsg(t("adminFinance.meters.inline.saved", { value: r.consumption }))
                  setTimeout(() => { setMsg(null); setOpen(false) }, 1500)
                }
              })}
              className="p-5 space-y-4"
            >
              <input type="hidden" name="meterId" value={meterId} />
              <input type="hidden" name="period" value={period} />
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.meters.inline.value")}</label>
                <Input name="value" type="number" step="0.01" required autoFocus />
              </div>
              {msg && <p className="text-xs text-center text-emerald-600 dark:text-emerald-400">{msg}</p>}
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  {pending ? "..." : t("common.actions.save")}
                </Button>
              </div>
            </form>
          </ModalShell>
    </>
  )
}

export function MeterReadingDialog({ meters }: { meters: Meter[] }) {
  const { t } = useT()
  const typeLabel = useMeterTypeLabel()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const period = new Date().toISOString().slice(0, 7)
  const hasMeters = meters.length > 0

  return (
    <>
      <Button
        onClick={() => {
          if (hasMeters) setOpen(true)
        }}
        disabled={!hasMeters}
        title={hasMeters ? t("adminFinance.meters.reading.trigger") : t("adminFinance.meters.reading.triggerHint")}
        leftIcon={<Gauge className="h-4 w-4" />}
      >
        {t("adminFinance.meters.reading.trigger")}
      </Button>

      <ModalShell open={open} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">{t("adminFinance.meters.reading.title")}</h2>
              <button onClick={() => setOpen(false)} aria-label={t("common.actions.close")}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) => startTransition(async () => {
                const r = await saveMeterReading(fd)
                if ("error" in r) { setMsg(t("adminFinance.meters.inline.error", { message: r.error ?? "" })) }
                else {
                  setMsg(t("adminFinance.meters.reading.saved", { value: r.consumption }))
                  setTimeout(() => { setMsg(null); setOpen(false) }, 2000)
                }
              })}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.meters.reading.meter")}</label>
                <select name="meterId" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none">
                  <option value="">{t("adminFinance.meters.reading.meterPlaceholder")}</option>
                  {meters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {t("adminFinance.meters.reading.meterOption", {
                        type: typeLabel(m.type),
                        number: m.number,
                        room: m.space.number,
                      })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.meters.reading.value")}</label>
                <Input name="value" type="number" step="0.01" required />
              </div>
              <input type="hidden" name="period" value={period} />
              {msg && <p className="text-sm text-center text-emerald-600 dark:text-emerald-400">{msg}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  {pending ? t("common.actions.saving") : t("common.actions.save")}
                </Button>
              </div>
            </form>
          </ModalShell>
    </>
  )
}

export function AddMeterDialog({ spaces }: { spaces: Space[] }) {
  const { t } = useT()
  const typeLabel = useMeterTypeLabel()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const hasSpaces = spaces.length > 0

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          if (hasSpaces) setOpen(true)
        }}
        disabled={!hasSpaces}
        title={hasSpaces ? t("adminFinance.meters.add.trigger") : t("adminFinance.meters.add.triggerHint")}
        leftIcon={<Plus className="h-4 w-4" />}
      >
        {t("adminFinance.meters.add.trigger")}
      </Button>

      <ModalShell open={open} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">{t("adminFinance.meters.add.title")}</h2>
              <button onClick={() => setOpen(false)} aria-label={t("common.actions.close")}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) => startTransition(async () => { await createMeter(fd); setOpen(false) })}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.meters.add.space")}</label>
                <select name="spaceId" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none">
                  <option value="">{t("adminFinance.meters.add.spacePlaceholder")}</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t("adminFinance.meters.add.spaceOption", { number: s.number, floor: s.floor.name })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.meters.add.type")}</label>
                  <select name="type" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none">
                    <option value="ELECTRICITY">{typeLabel("ELECTRICITY")}</option>
                    <option value="WATER">{typeLabel("WATER")}</option>
                    <option value="HEAT">{typeLabel("HEAT")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.meters.add.number")}</label>
                  <Input name="number" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.meters.add.initial")}</label>
                <Input
                  name="initialValue"
                  type="number"
                  step="0.01"
                  placeholder={t("adminFinance.meters.add.initialPlaceholder")}
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{t("adminFinance.meters.add.initialHint")}</p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  {pending ? t("adminFinance.meters.add.submitting") : t("adminFinance.meters.add.submit")}
                </Button>
              </div>
            </form>
          </ModalShell>
    </>
  )
}
