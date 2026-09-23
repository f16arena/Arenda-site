"use client"

import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { changeOwnPassword } from "@/app/actions/change-password"
import { ShieldCheck, AlertCircle, CheckCircle2, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/client"

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
  const { t } = useT()
  const [state, action, isPending] = useActionState<FormState, FormData>(submit, undefined)
  const router = useRouter()

  useEffect(() => {
    if (state?.ok) {
      const timer = setTimeout(() => {
        router.replace(targetAfter)
        router.refresh()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [state?.ok, router, targetAfter])

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 mb-4">
          <KeyRound className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          {forced ? t("auth.changePassword.titleForced") : t("auth.changePassword.title")}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{userLogin}</p>
      </div>

      {forced && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {t("auth.changePassword.forcedHint")}
            </span>
          </div>
        </div>
      )}

      <Card className="block p-6">
        <form action={action} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t("common.profile.currentPassword")}
            </label>
            <Input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t("common.profile.newPassword")}
            </label>
            <Input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t("auth.changePassword.confirmNewPassword")}
            </label>
            <Input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
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

          {state?.ok && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="font-medium">{state.message ?? t("auth.changePassword.doneTitle")}</span>
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
            {isPending
              ? t("auth.changePassword.submitting")
              : state?.ok
                ? t("common.actions.done")
                : t("auth.changePassword.submit")}
          </Button>
        </form>
      </Card>
    </div>
  )
}
