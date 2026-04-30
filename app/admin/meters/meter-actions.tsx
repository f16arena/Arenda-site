"use client"

import { useState, useTransition } from "react"
import { Plus, X, Gauge } from "lucide-react"
import { saveMeterReading, createMeter } from "@/app/actions/meters"

type Meter = { id: string; type: string; number: string; space: { number: string } }
type Space = { id: string; number: string; floor: { name: string } }

const typeLabel: Record<string, string> = {
  ELECTRICITY: "Электричество",
  WATER: "Вода",
  HEAT: "Тепло",
}

export function InlineReadingButton({ meterId, period }: { meterId: string; period: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:underline">Внести</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xs">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold">Показание счётчика</h2>
              <button onClick={() => setOpen(false)}><X className="h-4 w-4 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) => startTransition(async () => {
                const r = await saveMeterReading(fd)
                if ("error" in r) { setMsg(`Ошибка: ${r.error}`) }
                else { setMsg(`✓ Расход: ${r.consumption}`); setTimeout(() => { setMsg(null); setOpen(false) }, 1500) }
              })}
              className="p-5 space-y-4"
            >
              <input type="hidden" name="meterId" value={meterId} />
              <input type="hidden" name="period" value={period} />
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Текущее показание *</label>
                <input name="value" type="number" step="0.01" required autoFocus
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              {msg && <p className="text-xs text-center text-emerald-600">{msg}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function MeterReadingDialog({ meters }: { meters: Meter[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const period = new Date().toISOString().slice(0, 7)

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        <Gauge className="h-4 w-4" />
        Внести показания
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Внести показания</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) => startTransition(async () => {
                const r = await saveMeterReading(fd)
                if ("error" in r) { setMsg(`Ошибка: ${r.error}`) }
                else { setMsg(`✓ Сохранено. Расход: ${r.consumption}`); setTimeout(() => { setMsg(null); setOpen(false) }, 2000) }
              })}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Счётчик *</label>
                <select name="meterId" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none">
                  <option value="">Выберите счётчик</option>
                  {meters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {typeLabel[m.type] ?? m.type} #{m.number} · каб. {m.space.number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Текущее показание *</label>
                <input name="value" type="number" step="0.01" required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <input type="hidden" name="period" value={period} />
              {msg && <p className="text-sm text-center text-emerald-600">{msg}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function AddMeterDialog({ spaces }: { spaces: Space[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
        <Plus className="h-4 w-4" />
        Добавить счётчик
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Новый счётчик</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form
              action={(fd) => startTransition(async () => { await createMeter(fd); setOpen(false) })}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Помещение *</label>
                <select name="spaceId" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none">
                  <option value="">Выберите помещение</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>Каб. {s.number} · {s.floor.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Тип</label>
                  <select name="type" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none">
                    <option value="ELECTRICITY">Электричество</option>
                    <option value="WATER">Вода</option>
                    <option value="HEAT">Тепло</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Номер *</label>
                  <input name="number" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Начальное показание</label>
                <input
                  name="initialValue"
                  type="number"
                  step="0.01"
                  placeholder="Текущее показание счётчика на момент установки"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">От этого значения будет считаться расход</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
