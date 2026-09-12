"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createProjectFromBuilding, type BuildableBuilding } from "@/app/actions/builder-from-building"
import type { BuildReport } from "@/lib/builder/from-building"

export function BuildFromBuilding({ buildings }: { buildings: BuildableBuilding[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ id: string; report: BuildReport } | null>(null)

  function build(id: string) {
    startTransition(async () => {
      try {
        const res = await createProjectFromBuilding(id)
        setResult(res)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось собрать модель")
      }
    })
  }

  if (buildings.length === 0) return null

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Wand2 className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="font-medium text-slate-900 dark:text-slate-100">Собрать из данных здания</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Модель строится из этажей, помещений и планов, которые уже введены. Где план этажа
              сохранён — точно по нему, где плана нет — раскладкой по площадям. Данные при этом
              не меняются: площади в карточках остаются как есть.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {buildings.map((b) => (
            <div key={b.id} className="flex items-center gap-3 py-2.5">
              <Building2 className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{b.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {b.floors} эт. · {b.spaces} помещ. ·{" "}
                  {b.floorsWithPlan > 0
                    ? `${b.floorsWithPlan} с планом`
                    : "планов этажей нет, будет раскладка по площадям"}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto shrink-0"
                disabled={pending || (b.floors === 0 && b.spaces === 0)}
                onClick={() => build(b.id)}
              >
                Собрать
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Dialog
        open={!!result}
        onOpenChange={(next) => {
          if (!next) setResult(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Модель собрана</DialogTitle>
            <DialogDescription>Данные здания не изменились — это отдельный проект.</DialogDescription>
          </DialogHeader>

          {result && (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                <dt className="text-slate-500 dark:text-slate-400">Этажей по сохранённому плану</dt>
                <dd className="font-semibold tabular-nums">{result.report.floorsExact}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Этажей разложено по площадям</dt>
                <dd className="font-semibold tabular-nums">{result.report.floorsApprox}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Комнат привязано к помещениям</dt>
                <dd className="font-semibold tabular-nums">{result.report.roomsLinked}</dd>
              </dl>

              {result.report.floorsSkipped.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Пропущены: {result.report.floorsSkipped.join(", ")}. Территория и этажи без данных
                  в модель здания не входят.
                </p>
              )}

              {result.report.spacesUnlinked.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  Не нашлось комнаты для помещений: {result.report.spacesUnlinked.join(", ")}.
                  Привяжите их в конструкторе вручную.
                </div>
              )}

              {result.report.mismatches.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
                    Площадь в модели расходится с карточкой
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {result.report.mismatches.map((m) => (
                      <div
                        key={m.spaceNumber}
                        className="flex items-center gap-3 border-b border-slate-50 px-3 py-1.5 text-xs last:border-b-0 dark:border-slate-800/60"
                      >
                        <span className="font-medium">{m.spaceNumber}</span>
                        <span className="ml-auto tabular-nums text-slate-500 dark:text-slate-400">
                          карточка {m.cardM2} м²
                        </span>
                        <span className="tabular-nums font-medium">модель {m.modelM2} м²</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Мы ничего не исправляли. Площадь в карточке — условие договора, менять её
                    можно только там.
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResult(null)} className="flex-1">
              Закрыть
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => {
                if (result) router.push(`/admin/builder?project=${result.id}`)
              }}
            >
              Открыть модель
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
