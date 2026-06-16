"use client"

import { useEffect, useState, useActionState } from "react"
import { signup } from "@/app/actions/signup"
import { checkSlugAvailable, type SlugCheckResult } from "@/app/actions/organizations"
import { slugify } from "@/lib/slugify"
import Link from "next/link"
import { Loader2, Check, AlertCircle } from "lucide-react"
import { KzPhoneInput, AsciiEmailInput } from "@/components/forms/contact-inputs"

export function SignupForm() {
  const [state, action, isPending] = useActionState(signup, undefined)

  const [companyName, setCompanyName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugCheck, setSlugCheck] = useState<{ status: "idle" | "checking" | "result"; result?: SlugCheckResult }>({ status: "idle" })
  // Принятие оферты — обязательное условие акцепта. Без галки кнопка
  // регистрации заблокирована. Текст «Я принимаю...» — это правовой акцепт.
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  function autoSlug(v: string) {
    setCompanyName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!slug) {
        setSlugCheck({ status: "idle" })
        return
      }
      setSlugCheck({ status: "checking" })
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
    }, slug ? 400 : 0)
    return () => clearTimeout(t)
  }, [slug])

  const checkResult = slugCheck.status === "result" ? slugCheck.result : undefined
  const isSlugOk = checkResult?.ok === true
  const isSlugBad = checkResult && !checkResult.ok
  const updateSlug = (value: string) => {
    setSlugTouched(true)
    setSlug(slugify(value, { trimEnd: false }))
  }

  if (state?.pendingApproval) {
    return (
      <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">Заявка отправлена на подтверждение</p>
            <p className="mt-1 leading-6">
              {state.message ?? "Суперадмин проверит заявку. После подтверждения можно будет войти в кабинет."}
            </p>
            {state.orgSlug && (
              <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-emerald-800">
                {state.orgSlug}.commrent.kz
              </p>
            )}
          </div>
        </div>
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 py-2.5 font-semibold text-emerald-800 transition hover:bg-emerald-100"
        >
          Перейти ко входу
        </Link>
      </div>
    )
  }

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
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Адрес вашей рабочей зоны *
          </label>
          <div className="relative">
            <input
              name="slug"
              value={slug}
              onChange={(e) => updateSlug(e.currentTarget.value)}
              required
              maxLength={20}
              placeholder="bc-almaty"
              className={`w-full rounded-lg border px-3.5 py-2.5 pr-12 text-sm font-mono lowercase focus:outline-none focus:ring-2 transition ${
                isSlugOk ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                : isSlugBad ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
              }`}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
              .commrent.kz
            </span>
          </div>
          {!slug && <p className="text-[11px] text-slate-400 mt-1">5–20 символов: латиница, цифры, дефис</p>}
          {slugCheck.status === "checking" && (
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Проверяем...
            </p>
          )}
          {isSlugOk && checkResult && checkResult.ok && (
            <p className="text-[11px] mt-1 flex items-center gap-1 text-emerald-700">
              <Check className="h-3 w-3" />
              Свободно. Будет: {checkResult.url}
            </p>
          )}
          {isSlugBad && checkResult && !checkResult.ok && (
            <div className="mt-1">
              <p className="text-[11px] text-red-600">{checkResult.reason}</p>
              {checkResult.suggestions && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Свободные:{" "}
                  {checkResult.suggestions.map((s, i) => (
                    <span key={s}>
                      <button type="button" onClick={() => { setSlugTouched(true); setSlug(s) }} className="font-mono text-blue-600 hover:underline">{s}</button>
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
          <Field label="Телефон" name="ownerPhone" type="tel" placeholder="+7 700 000 00 00" />
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

      {/* Согласие с офертой консолидировано в одном чекбоксе ниже («acceptedTerms»). */}
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="font-medium">{state.error}</span>
        </div>
      )}

      <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
        <input
          type="checkbox"
          name="acceptedTerms"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          required
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span>
          Я принимаю{" "}
          <Link href="/offer" target="_blank" className="text-blue-600 hover:underline">Публичную оферту</Link>,{" "}
          <Link href="/privacy" target="_blank" className="text-blue-600 hover:underline">Политику конфиденциальности</Link>,{" "}
          <Link href="/terms" target="_blank" className="text-blue-600 hover:underline">Условия использования</Link>{" "}
          и даю согласие на обработку моих персональных данных и данных моей организации.
        </span>
      </label>

      <button
        type="submit"
        disabled={isPending || isSlugBad || !acceptedTerms}
        className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 py-3 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending ? "Создаём..." : "Начать 14-дневный триал бесплатно"}
      </button>

      <p className="text-center text-xs text-slate-500">
        Без оплаты, без карты. После триала — выберете тариф или продолжите смотреть в режиме чтения.
      </p>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{title}</p>
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
  const inputCls = "w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {type === "tel" ? (
        <KzPhoneInput name={name} defaultValue={value} required={required} className={inputCls} />
      ) : type === "email" ? (
        <AsciiEmailInput name={name} defaultValue={value} required={required} className={inputCls} />
      ) : (
        <input
          name={name}
          type={type}
          value={value}
          onChange={onChange ? (e) => onChange(e.currentTarget.value) : undefined}
          required={required}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
