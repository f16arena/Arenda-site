"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Lock, CheckCircle2 } from "lucide-react"
import { resetPassword } from "@/app/actions/password-reset"

export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition()
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const router = useRouter()

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-900">Пароль изменён</p>
              <p className="text-xs text-emerald-800 mt-1">Теперь вы можете войти с новым паролем.</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 py-2.5 text-sm font-semibold text-white"
        >
          Войти
        </button>
      </div>
    )
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null)
          fd.set("token", token)
          const r = await resetPassword(fd)
          if (r.ok) setDone(true)
          else setError(r.error)
        })
      }
      className="space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Новый пароль</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type={show ? "text" : "password"}
            name="newPassword"
            minLength={8}
            required
            placeholder="••••••••"
            autoComplete="new-password"
            className="w-full rounded-lg border border-slate-200 pl-9 pr-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <p className="text-xs text-slate-500 mt-1">Минимум 8 символов</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Повторите пароль</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type={show ? "text" : "password"}
            name="confirmPassword"
            minLength={8}
            required
            placeholder="••••••••"
            autoComplete="new-password"
            className="w-full rounded-lg border border-slate-200 pl-9 pr-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Показать пароль
      </label>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Сохранение..." : "Установить новый пароль"}
      </button>
    </form>
  )
}
