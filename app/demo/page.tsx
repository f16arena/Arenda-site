export const dynamic = "force-dynamic"

import { Building2, Check, RotateCcw, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { enterDemo } from "@/app/actions/demo"
import { getT } from "@/lib/i18n/server"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("landing.demo.metaTitle"),
    description: t("landing.demo.metaDescription"),
  }
}

/**
 * Публичная демо-страница (как portal-demo.pro.rent): один клик — и посетитель
 * внутри готового демо-БЦ владельцем. Данные сбрасываются каждую ночь.
 */
export default async function DemoPage() {
  const { t } = await getT()
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 sm:p-10">
          <Badge className="mb-6 h-auto gap-2 border-purple-500/30 bg-purple-500/10 px-3 py-1 font-semibold text-purple-300">
            <Sparkles className="h-3.5 w-3.5" />
            {t("landing.demo.badge")}
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            {t("landing.demo.title")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {t("landing.demo.lead")}
          </p>

          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            {[
              t("landing.demo.features.tenants"),
              t("landing.demo.features.documents"),
              t("landing.demo.features.finance"),
              t("landing.demo.features.plan"),
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {line}
              </li>
            ))}
          </ul>

          <form action={enterDemo} className="mt-8">
            <button
              type="submit"
              className="w-full rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 hover:bg-slate-200 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Building2 className="h-4 w-4" />
              {t("landing.demo.enter")}
            </button>
          </form>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <RotateCcw className="h-3 w-3" />
            {t("landing.demo.resetNote")}
          </p>
        </div>
      </div>
    </div>
  )
}
