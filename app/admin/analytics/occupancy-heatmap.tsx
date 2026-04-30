import { Flame } from "lucide-react"
import { cn } from "@/lib/utils"

export function OccupancyHeatmap({ data }: {
  data: { spaceId: string; spaceNumber: string; area: number; percent: number }[]
}) {
  if (data.length === 0) return null

  const sorted = [...data].sort((a, b) => b.percent - a.percent)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          Heatmap занятости помещений
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">% времени помещение занято с начала года</p>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-6 md:grid-cols-10 gap-2">
          {sorted.map((s) => {
            const intensity = s.percent / 100
            // От белого через жёлтый-оранжевый-красный
            const bg = `linear-gradient(135deg, hsla(${20 - intensity * 20}, 90%, ${100 - intensity * 50}%, 1), hsla(${15 - intensity * 15}, 95%, ${95 - intensity * 50}%, 1))`
            return (
              <div
                key={s.spaceId}
                className={cn(
                  "aspect-square rounded-lg p-2 text-center flex flex-col items-center justify-center border",
                  s.percent >= 90 ? "border-red-300 dark:border-red-500/40" : s.percent >= 50 ? "border-amber-300 dark:border-amber-500/40" : "border-slate-200 dark:border-slate-800"
                )}
                style={{ background: bg }}
                title={`Каб. ${s.spaceNumber} · ${s.area} м² · занят ${s.percent}% времени`}
              >
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{s.spaceNumber}</p>
                <p className={cn(
                  "text-[10px]",
                  s.percent >= 70 ? "text-white font-bold" : "text-slate-600 dark:text-slate-400 dark:text-slate-500"
                )}>
                  {s.percent}%
                </p>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ background: "hsl(20, 90%, 100%)" }} />
            <span>0%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ background: "hsl(15, 90%, 70%)" }} />
            <span>50%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ background: "hsl(0, 95%, 50%)" }} />
            <span>100%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
