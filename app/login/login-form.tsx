"use client"

import { useActionState } from "react"
import Link from "next/link"
import Image from "next/image"
import { login } from "@/app/actions/auth"
import { AlertCircle, CheckCircle2, XCircle, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export function LoginForm() {
  const [state, action, isPending] = useActionState(login, undefined)

  return (
    <div className="w-full max-w-md">
      {/* Logo — тот же PNG, что на лендинге, чтобы пользователь видел
          целостный бренд при переходах /signup → /login → /admin */}
      <Link href="/" className="block text-center mb-8" aria-label="Commrent.kz">
        <Image
          src="/commrent-logo-navbar.png"
          alt="Commrent.kz"
          width={214}
          height={75}
          priority
          className="h-14 w-auto object-contain mx-auto"
        />
        <p className="text-sm text-slate-500 mt-3">Войдите в свой аккаунт</p>
      </Link>

      {/* Card */}
      <Card className="block p-6">
        <form action={action} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Телефон или Email
            </label>
            <Input
              name="login"
              type="text"
              placeholder="+7 700 000 00 00"
              autoComplete="username"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">
                Пароль
              </label>
              <Link href="/forgot-password" className="text-xs text-blue-600 hover:underline font-medium">
                Забыли пароль?
              </Link>
            </div>
            <Input
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {state?.needTotp && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex items-start gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Двухфакторная аутентификация</p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Введите 6-значный код из приложения или резервный код XXXX-XXXX.
                  </p>
                </div>
              </div>
              <Input
                name="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000 или XXXX-XXXX"
                autoFocus
                className="border-emerald-300 bg-white text-center font-mono text-base tracking-widest focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
              />
            </div>
          )}

          {state?.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="font-medium">{state.error}</span>
              </div>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            loading={isPending}
            className="w-full font-semibold"
          >
            {isPending ? "Вход..." : "Войти"}
          </Button>
        </form>
      </Card>

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
