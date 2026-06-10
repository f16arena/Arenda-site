export const dynamic = "force-dynamic"

import { Building2, Check, RotateCcw, Sparkles } from "lucide-react"
import { enterDemo } from "@/app/actions/demo"

export const metadata = {
  title: "Демо · Commrent",
  description: "Попробуйте Commrent без регистрации: демо бизнес-центра с арендаторами, договорами и финансами.",
}

/**
 * Публичная демо-страница (как portal-demo.pro.rent): один клик — и посетитель
 * внутри готового демо-БЦ владельцем. Данные сбрасываются каждую ночь.
 */
export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 sm:p-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-purple-500/10 border border-purple-500/30 px-3 py-1 text-xs font-semibold text-purple-300">
            <Sparkles className="h-3.5 w-3.5" />
            ДЕМО-РЕЖИМ
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            Попробуйте Commrent на готовом бизнес-центре
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Один клик — и вы владелец демо-БЦ «Алатау»: 2 этажа, территория с паркингом,
            арендаторы с договорами, должник с просрочкой, депозиты, начисления и платежи.
            Нажимайте всё подряд — сломать ничего нельзя.
          </p>

          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            {[
              "Арендаторы, договоры с ЭЦП, доп. соглашения и продление",
              "Счета, АВР, акты сверки — конструкторы и автосоздание",
              "Финансы: начисления, оплаты, долги, депозиты, авансы",
              "План этажа 2D/3D, аналитика, заявки и уведомления",
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
              Войти в демо
            </button>
          </form>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <RotateCcw className="h-3 w-3" />
            Все данные демо автоматически сбрасываются раз в сутки
          </p>
        </div>
      </div>
    </div>
  )
}
