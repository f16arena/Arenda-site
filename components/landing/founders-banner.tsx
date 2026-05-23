import { Sparkles } from "lucide-react"
import { getFoundersRemainingSlots } from "@/lib/pricing"

/**
 * Тонкая полоска urgency над hero: «Founding Pricing — осталось N из 15».
 * Скрывается, если программа неактивна или слоты кончились.
 */
export async function FoundersBanner() {
  const founding = await getFoundersRemainingSlots().catch(() => null)
  if (!founding || !founding.isActive || founding.remaining <= 0) return null

  return (
    <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 border-b border-amber-500/30">
      <div className="mx-auto max-w-7xl px-5 py-2 sm:px-8 flex items-center justify-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-amber-900 dark:text-amber-100">
          <b>Founding Pricing:</b> осталось <b>{founding.remaining} из {founding.total}</b> мест ·
          <span className="ml-1">−40% lifetime для первых клиентов</span>
        </span>
      </div>
    </div>
  )
}
