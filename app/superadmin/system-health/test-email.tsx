"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, Mail, XCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { sendTestEmail, type TestEmailResult } from "@/app/actions/test-email"
import { useT } from "@/lib/i18n/client"

export function TestEmailTool() {
  const [to, setTo] = useState("")
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<TestEmailResult | null>(null)
  const { t } = useT()

  function run() {
    if (!to.trim()) {
      toast.error(t("superadmin.health.email.needEmail"))
      return
    }
    startTransition(async () => {
      try {
        const r = await sendTestEmail(to)
        setResult(r)
        if (r.ok) toast.success(t("superadmin.health.email.accepted"))
        else toast.error(t("superadmin.health.email.rejected"))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("superadmin.health.email.failed"))
      }
    })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("superadmin.health.email.title")}</h2>
      </div>
      <p className="mb-3 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
        {t("superadmin.health.email.hint")}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={t("superadmin.health.email.placeholder")}
          className="min-w-0 flex-1"
        />
        <button
          onClick={run}
          disabled={pending}
          className="shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-60"
        >
          {pending ? t("superadmin.health.email.sending") : t("superadmin.health.email.send")}
        </button>
      </div>

      {result && (
        <div className={`mt-3 rounded-lg border p-3 text-xs ${
          result.ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
            : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
        }`}>
          <p className="flex items-center gap-1.5 font-medium">
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {result.ok
              ? t("superadmin.health.email.acceptedId", { id: result.id ?? "—" })
              : t("superadmin.health.email.sendError")}
          </p>
          <p className="mt-1 font-mono break-all">{t("superadmin.health.email.from", { from: result.from })}</p>
          {result.error && (
            <p className="mt-1 font-mono break-all">{t("superadmin.health.email.resend", { error: result.error })}</p>
          )}
          {!result.ok && (
            <p className="mt-2 opacity-80">
              {t("superadmin.health.email.domainHint")}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
