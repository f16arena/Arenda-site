"use client"

import { useActionState } from "react"
import { login } from "@/app/actions/auth"
import { Building, Loader2 } from "lucide-react"

export default function LoginPage() {
  const [state, action, isPending] = useActionState(login, undefined)

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 mb-4">
            <Building className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">ArendaPro</h1>
          <p className="text-sm text-slate-500 mt-1">Войдите в свой аккаунт</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <form action={action} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Телефон или Email
              </label>
              <input
                name="login"
                type="text"
                placeholder="+7 700 000 00 00"
                autoComplete="username"
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Пароль
              </label>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
              />
            </div>

            {state?.error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPending ? "Вход..." : "Войти"}
            </button>
          </form>
        </div>

        {/* Test accounts hint */}
        <div className="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-4 text-xs text-blue-700 space-y-1">
          <p className="font-semibold">Аккаунты для входа:</p>
          <p>Владелец: <span className="font-mono">f16arena@gmail.com</span> / <span className="font-mono">F16arena2024!</span></p>
          <p>Администратор: <span className="font-mono">admin@f16arena.kz</span> / <span className="font-mono">admin2024!</span></p>
          <p>Бухгалтер: <span className="font-mono">buh@f16arena.kz</span> / <span className="font-mono">buh2024!</span></p>
          <p>Завхоз: <span className="font-mono">+77000000004</span> / <span className="font-mono">manager2024!</span></p>
        </div>
      </div>
    </div>
  )
}
