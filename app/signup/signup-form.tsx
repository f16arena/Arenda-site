"use client"

import { useEffect, useState, useActionState } from "react"
import { signup, type SignupResult } from "@/app/actions/signup"
import { checkSlugAvailable, type SlugCheckResult } from "@/app/actions/organizations"
import { slugify } from "@/lib/slugify"
import Link from "next/link"
import { Loader2, Check, AlertCircle } from "lucide-react"

export function SignupForm() {
  const [state, action, isPending] = useActionState(signup, undefined)

  const [companyName, setCompanyName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugCheck, setSlugCheck] = useState<{ status: "idle" | "checking" | "result"; result?: SlugCheckResult }>({ status: "idle" })

  function autoSlug(v: string) {
    setCompanyName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  useEffect(() => {
    if (!slug) {
      setSlugCheck({ status: "idle" })
      return
    }
    setSlugCheck({ status: "checking" })
    const t = setTimeout(async () => {
      // Используем тот же checkSlugAvailable что и для платформ-админа,
      // но он требует isPlatformOwner — для signup сделаем без серверной
      // проверки (валидация всё равно произойдёт на submit), а для UI хватит
      // локальной валидации формата.
      try {
        const r = await checkSlugAvailable(slug).catch(() => null)
        if (r) setSlugCheck({ status: "result", result: r })
        else setSlugCheck({ status: "idle" })
      } catch {
        setSlugCheck({ status: "idle" })
      }
    }, 400)
    return () => clearTimeout(t)
  }, [slug])

  const checkResult = slugCheck.status === "result" ? slugCheck.result : undefined
  const isSlugOk = checkResult?.ok === true
  const isSlugBad = checkResult && !checkResult.ok

  return (
    <form action={action} className="space-y-5">
      <Section title="О вашей компании">
        <Field
          label="Название организации *"
          name="companyName"
          value={companyName}
          onChange={autoSlug}
          required
          placeholder='ТОО "БЦ Алматы"'
          hint="Так клиенты увидят вас"
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Адрес вашей рабочей зоны *
          </label>
          <div className="relative">
            <input
              value={slug}
              onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
              required
              maxLength={20}
              placeholder="bc-almaty"
              className={`w-full rounded-lg border px-3.5 py-2.5 pr-12 text-sm font-mono lowercase focus:outline-none focus:ring-2 transition ${
                isSlugOk ? "border-emerald-300 dark:border-emerald-500/40 focus:border-emerald-500 focus:ring-emerald-500/20"
                : isSlugBad ? "border-red-300 dark:border-red-500/40 focus:border-red-500 focus:ring-red-500/20"
                : "border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-blue-500/20"
              }`}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 font-mono">
              .commrent.kz
            </span>
          </div>
          <input type="hidden" name="slug" value={slug} />
          {!slug && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">5–20 символов: латиница, цифры, дефис</p>}
          {slugCheck.status === "checking" && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Проверяем...
            </p>
          )}
          {isSlugOk && checkResult && checkResult.ok && (
            <p className="text-[11px] mt-1 flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <Check className="h-3 w-3" />
              Свободно. Будет: {checkResult.url}
            </p>
          )}
          {isSlugBad && checkResult && !checkResult.ok && (
            <div className="mt-1">
              <p className="text-[11px] text-red-600 dark:text-red-400">{checkResult.reason}</p>
              {checkResult.suggestions && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
                  Свободные:{" "}
                  {checkResult.suggestions.map((s, i) => (
                    <span key={s}>
                      <button type="button" onClick={() => { setSlugTouched(true); setSlug(s) }} className="font-mono text-blue-600 dark:text-blue-400 hover:underline">{s}</button>
                      {i < checkResult.suggestions!.length - 1 && ", "}
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="Владелец аккаунта">
        <Field label="ФИО *" name="ownerName" required placeholder="Иванов Иван Иванович" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Email" name="ownerEmail" type="email" placeholder="ivan@example.kz" />
          <Field label="Телефон" name="ownerPhone" placeholder="+7 700 000 00 00" />
        </div>
        <Field
          label="Пароль *"
          name="password"
          type="password"
          required
          placeholder="минимум 8 символов"
          hint="Запомните или сохраните в менеджер паролей"
        />
      </Section>

      {/* Согласие с офертой */}
      <label className="flex items-start gap-2.5 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" name="agreed" className="mt-0.5 h-4 w-4 rounded border-slate-300" />
        <span>
          Я ознакомлен и согласен с{" "}
          <Link href="/offer" className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank">Публичной офертой</Link>{", "}
          <Link href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank">Политикой конфиденциальности</Link>{" и "}
          <Link href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank">Пользовательским соглашением</Link>
        </span>
      </label>

      {state?.error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="font-medium">{state.error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || isSlugBad}
        className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 py-3 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending ? "Создаём..." : "Начать 14-дневный триал бесплатно"}
      </button>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
        Без оплаты, без карты. После триала — выберете тариф или продолжите смотреть в режиме чтения.
      </p>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, name, type = "text", value, onChange, required, placeholder, hint }: {
  label: string
  name: string
  type?: string
  value?: string
  onChange?: (v: string) => void
  required?: boolean
  placeholder?: string
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}
