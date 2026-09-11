"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createExtensionAddendum } from "@/app/actions/contract-addendums"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

function addMonths(base: Date, months: number): string {
  const d = new Date(base)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

/**
 * Продление договора в 1 клик: создаёт ДС о продлении (EXTEND_TERM) и сразу
 * отправляет арендатору на подпись. Базовые варианты +6/+12 мес или своя дата.
 */
export function RenewContractButton({
  contractId,
  contractNumber,
  currentEnd,
}: {
  contractId: string
  contractNumber: string
  currentEnd: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const base = currentEnd ? new Date(currentEnd) : new Date()
  const [date, setDate] = useState(() => addMonths(base, 12))
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const r = await createExtensionAddendum(contractId, date)
      if (!r.ok) { toast.error(r.error ?? "Не удалось создать ДС"); return }
      toast.success("ДС о продлении создано и отправлено арендатору на подпись")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Продлить договор № ${contractNumber}: ДС уйдёт арендатору на подпись`}
        className="flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300"
      >
        <CalendarPlus className="h-4 w-4" />
        Продлить
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Пока создаётся ДС — Esc и клик мимо не закрывают окно.
          if (pending) return
          setOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Продление договора № {contractNumber}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Будет создано доп. соглашение о продлении{currentEnd ? ` (сейчас договор до ${new Date(currentEnd).toLocaleDateString("ru-RU")})` : ""} и сразу отправлено арендатору на подпись.
              Остальные условия не меняются.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDate(addMonths(base, 6))}
                className={`rounded-lg border px-3 py-2 text-sm ${date === addMonths(base, 6) ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"}`}
              >
                +6 месяцев
              </button>
              <button
                type="button"
                onClick={() => setDate(addMonths(base, 12))}
                className={`rounded-lg border px-3 py-2 text-sm ${date === addMonths(base, 12) ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"}`}
              >
                +12 месяцев
              </button>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Новая дата окончания</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Отмена</Button>
            <button
              onClick={submit}
              disabled={pending || !date}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Создать и отправить
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
