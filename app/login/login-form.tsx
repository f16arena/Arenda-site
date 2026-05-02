"use client"

import { useActionState } from "react"
import Link from "next/link"
import { login } from "@/app/actions/auth"
import { Building, Loader2, AlertCircle, CheckCircle2, XCircle, ShieldCheck } from "lucide-react"

export function LoginForm() {
  const [state, action, isPending] = useActionState(login, undefined)

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 mb-4">
          <Building className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Commrent</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">Войдите в свой аккаунт</p>
      </div>

      {/* Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <form action={action} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Телефон или Email
            </label>
            <input
              name="login"
              type="text"
              placeholder="+7 700 000 00 00"
              autoComplete="username"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Пароль
              </label>
              <Link href="/forgot-password" className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Забыли пароль?
              </Link>
            </div>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </div>

          {state?.needTotp && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-4">
              <div className="flex items-start gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Двухфакторная аутентификация</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                    Введите 6-значный код из приложения или резервный код XXXX-XXXX.
                  </p>
                </div>
              </div>
              <input
                name="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000 или XXXX-XXXX"
                autoFocus
                className="w-full rounded-lg border border-emerald-300 dark:border-emerald-500/40 px-3.5 py-2.5 text-base font-mono tracking-widest text-center bg-white dark:bg-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          )}

          {state?.error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
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
        <details className="mt-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-xs">
          <summary className="cursor-pointer text-slate-600 dark:text-slate-400 dark:text-slate-500 font-medium select-none">
            Диагностика входа ({state.details.length} шагов)
          </summary>
          <ul className="mt-3 space-y-1.5 font-mono">
            {state.details.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                {d.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 mt-0.5 text-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <span className={d.ok ? "text-slate-700 dark:text-slate-300" : "text-red-700 dark:text-red-300"}>{d.step}</span>
                    <span className="text-slate-400 dark:text-slate-500">{d.ms}ms</span>
                  </div>
                  {d.note && (
                    <p className={`mt-0.5 break-all ${d.ok ? "text-slate-500 dark:text-slate-400 dark:text-slate-500" : "text-red-600 dark:text-red-400"}`}>
                      {d.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Подробнее по БД:{" "}
            <a href="/api/health/db" className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank">/api/health/db</a>
          </div>
        </details>
      )}

      {process.env.NODE_ENV !== "production" && (
        <div className="mt-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-semibold">Тестовые аккаунты (только в dev):</p>
          <p>Владелец: <span className="font-mono">+77000000001</span> / <span className="font-mono">owner123</span></p>
          <p>Администратор: <span className="font-mono">+77000000002</span> / <span className="font-mono">admin123</span></p>
        </div>
      )}
    </div>
  )
}
