import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Building, ArrowLeft, Check, Sparkles } from "lucide-react"
import { SignupForm } from "./signup-form"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Регистрация — Commrent",
  description: "Начните управлять арендой коммерческой недвижимости. 14 дней бесплатно без оплаты.",
}

export default async function SignupPage() {
  const session = await auth()
  if (session?.user) {
    // Уже залогинен — отправим на login (он сам разрулит куда дальше)
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800/50">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-6 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Building className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">Commrent</span>
          </Link>
          <Link href="/login" className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100">
            Уже есть аккаунт? <span className="font-medium text-blue-600">Войти</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100 mb-6">
          <ArrowLeft className="h-4 w-4" />
          На главную
        </Link>

        <div className="grid lg:grid-cols-[1fr_360px] gap-10">
          {/* Форма */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Создать аккаунт</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">14 дней бесплатно. Без оплаты, без карты.</p>
            </div>
            <SignupForm />
          </div>

          {/* Что внутри триала */}
          <aside className="space-y-4">
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-blue-900">В триале доступно всё</p>
              </div>
              <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                {[
                  "До 5 зданий, 100 арендаторов",
                  "Все шаблоны документов",
                  "Импорт арендаторов из Excel",
                  "Telegram-бот для уведомлений",
                  "Экспорт в Excel и 1С",
                  "Финансовый учёт и отчёты",
                ].map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500 mt-4 pt-4 border-t border-blue-200">
                После 14 дней выберете тариф (от 9 990 ₸/мес). Если не выберете — данные сохраним 30 дней
                в режиме просмотра, без потери.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Что будет после регистрации</p>
              <ol className="space-y-2 text-sm text-slate-700 dark:text-slate-300 list-decimal list-inside">
                <li>Получите свой поддомен (например, <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">your.commrent.kz</code>)</li>
                <li>Откроется wizard: создаёте здание и этажи за 5 минут</li>
                <li>Импортируете арендаторов из Excel или вводите вручную</li>
                <li>Готово — отправляете арендаторам ссылки на их кабинеты</li>
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
