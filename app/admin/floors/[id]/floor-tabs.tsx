"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Layers, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Вкладки карточки этажа: «Данные» (настройки + помещения) и «План»
 * (визуализация / редактор). Общий layout сохраняется между вкладками,
 * поэтому переключение мгновенное.
 */
export function FloorTabs({ floorId }: { floorId: string }) {
  const pathname = usePathname()
  const base = `/admin/floors/${floorId}`
  const isPlan = pathname?.startsWith(`${base}/visualization`)

  const tabs = [
    { href: base, label: "Данные", icon: Layers, active: !isPlan },
    { href: `${base}/visualization`, label: "План", icon: Sparkles, active: isPlan, beta: true },
  ]

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab.active
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
            {tab.beta && (
              <span className="rounded bg-purple-600 px-1 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wider text-white">
                BETA
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
