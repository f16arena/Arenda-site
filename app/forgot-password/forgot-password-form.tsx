"use client"

import { useState, useTransition } from "react"
import { Loader2, Mail, CheckCircle2, Copy } from "lucide-react"
import { requestPasswordReset } from "@/app/actions/password-reset"
import { toast } from "sonner"

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [previewLink, setPreviewLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-900">Письмо отправлено</p>
              <p className="text-xs text-emerald-800 mt-1">{message}</p>
            </div>
          </div>
        </div>

        {previewLink && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
            <p className="text-xs text-blue-900 font-medium">Тестовая ссылка (Resend не настроен):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                {previewLink}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(previewLink)
                  toast.success("Скопировано")
                }}
                className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 px-2 py-1 text-xs text-slate-700 dark:text-slate-300"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Если письмо не пришло за 5 минут — проверь папку «Спам» или попробуй ещё раз.
        </p>

        <button
          type="button"
          onClick={() => {
            setDone(false)
            setMessage(null)
            setPreviewLink(null)
          }}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Отправить ещё раз
        </button>
      </div>
    )
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null)
          const r = await requestPasswordReset(fd)
          if (r.ok) {
            setDone(true)
            setMessage(r.message ?? "Письмо отправлено")
            setPreviewLink(r.previewLink ?? null)
          } else {
            setError(r.error)
          }
        })
      }
      className="space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 pl-9 pr-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

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
        {pending ? "Отправка..." : "Отправить ссылку"}
      </button>
    </form>
  )
}
