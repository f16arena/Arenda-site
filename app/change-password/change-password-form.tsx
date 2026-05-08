"use client"

import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { changeOwnPassword } from "@/app/actions/change-password"
import { ShieldCheck, AlertCircle, CheckCircle2, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"

type FormState = { ok: boolean; message?: string; error?: string } | undefined

async function submit(_prev: FormState, formData: FormData): Promise<FormState> {
  return changeOwnPassword(formData)
}

export function ChangePasswordForm({
  forced,
  userLogin,
  targetAfter,
}: {
  forced: boolean
  userLogin: string
  targetAfter: string
}) {
  const [state, action, isPending] = useActionState<FormState, FormData>(submit, undefined)
  const router = useRouter()

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => {
        router.replace(targetAfter)
        router.refresh()
      }, 1500)
      return () => clearTimeout(t)
    }
  }, [state?.ok, router, targetAfter])

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 mb-4">
          <KeyRound className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {forced ? "Смените стартовый пароль" : "Смена пароля"}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{userLogin}</p>
      </div>

      {forced && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Ваш текущий пароль был выдан администратором как одноразовый.
              Задайте собственный пароль, чтобы продолжить работу.
            </span>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <form action={action} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Текущий пароль
            </label>
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Новый пароль (минимум 8 символов)
            </label>
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Подтвердите новый пароль
            </label>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {state?.error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="font-medium">{state.error}</span>
              </div>
            </div>
          )}

          {state?.ok && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="font-medium">{state.message ?? "Пароль изменён."}</span>
              </div>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            loading={isPending}
            disabled={state?.ok}
            className="w-full font-semibold"
          >
            {isPending ? "Сохранение..." : state?.ok ? "Готово" : "Сменить пароль"}
          </Button>
        </form>
      </div>
    </div>
  )
}
