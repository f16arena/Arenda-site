"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, Mail, XCircle } from "lucide-react"
import { sendTestEmail, type TestEmailResult } from "@/app/actions/test-email"

export function TestEmailTool() {
  const [to, setTo] = useState("")
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<TestEmailResult | null>(null)

  function run() {
    if (!to.trim()) {
      toast.error("Укажите email для теста")
      return
    }
    startTransition(async () => {
      try {
        const r = await sendTestEmail(to)
        setResult(r)
        if (r.ok) toast.success("Письмо принято Resend — проверьте входящие/спам")
        else toast.error("Resend вернул ошибку")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось отправить")
      }
    })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Проверка доставки email</h2>
      </div>
      <p className="mb-3 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
        Отправляет тестовое письмо через Resend и показывает реальный ответ. Если «Забыли пароль» не доходит — здесь видна точная причина (напр. домен не подтверждён в Resend).
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="вашe@email.com"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-purple-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          onClick={run}
          disabled={pending}
          className="shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-60"
        >
          {pending ? "Отправляю…" : "Отправить тест"}
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
            {result.ok ? `Принято Resend (id: ${result.id ?? "—"})` : "Ошибка отправки"}
          </p>
          <p className="mt-1 font-mono break-all">Отправитель: {result.from}</p>
          {result.error && <p className="mt-1 font-mono break-all">Resend: {result.error}</p>}
          {!result.ok && (
            <p className="mt-2 opacity-80">
              Чаще всего: домен из «Отправитель» не подтверждён в Resend. Подтвердите домен (DNS: SPF/DKIM) в дашборде Resend и используйте его в EMAIL_FROM.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
