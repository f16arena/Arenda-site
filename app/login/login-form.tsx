"use client"

import { useActionState } from "react"
import { login } from "@/app/actions/auth"
import { Building, Loader2, AlertCircle, CheckCircle2, XCircle } from "lucide-react"

export function LoginForm() {
  const [state, action, isPending] = useActionState(login, undefined)

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 mb-4">
          <Building className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Commrent</h1>
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
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="font-medium">{state.error}</span>
              </div>
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

      {/* Diagnostic block */}
      {state?.details && state.details.length > 0 && (
        <details className="mt-3 rounded-xl bg-white border border-slate-200 p-4 text-xs">
          <summary className="cursor-pointer text-slate-600 font-medium select-none">
            Диагностика входа ({state.details.length} шагов)
          </summary>
          <ul className="mt-3 space-y-1.5 font-mono">
            {state.details.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                {d.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 mt-0.5 text-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <span className={d.ok ? "text-slate-700" : "text-red-700"}>{d.step}</span>
                    <span className="text-slate-400">{d.ms}ms</span>
                  </div>
                  {d.note && (
                    <p className={`mt-0.5 break-all ${d.ok ? "text-slate-500" : "text-red-600"}`}>
                      {d.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            Подробнее по БД:{" "}
            <a href="/api/health/db" className="text-blue-600 hover:underline" target="_blank">/api/health/db</a>
          </div>
        </details>
      )}

      {process.env.NODE_ENV !== "production" && (
        <div className="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-4 text-xs text-blue-700 space-y-1">
          <p className="font-semibold">Тестовые аккаунты (только в dev):</p>
          <p>Владелец: <span className="font-mono">+77000000001</span> / <span className="font-mono">owner123</span></p>
          <p>Администратор: <span className="font-mono">+77000000002</span> / <span className="font-mono">admin123</span></p>
        </div>
      )}
    </div>
  )
}
