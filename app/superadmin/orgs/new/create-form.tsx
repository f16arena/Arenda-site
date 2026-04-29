"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { createOrganization, checkSlugAvailable, type SlugCheckResult } from "@/app/actions/organizations"
import { slugify } from "@/lib/slugify"
import { Copy, Check, Loader2, AlertCircle, ExternalLink } from "lucide-react"

type Plan = {
  id: string
  code: string
  name: string
  priceMonthly: number
  maxBuildings: number | null
  maxTenants: number | null
}

export function CreateOrgForm({ plans }: { plans: Plan[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugCheck, setSlugCheck] = useState<{ status: "idle" | "checking" | "result"; result?: SlugCheckResult }>({ status: "idle" })
  const [created, setCreated] = useState<{ ownerEmail: string | null; ownerPhone: string | null; tempPassword: string; orgId: string; slug: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function autoSlug(v: string) {
    setName(v)
    if (!slugTouched) {
      setSlug(slugify(v))
    }
  }

  function manualSlug(v: string) {
    setSlugTouched(true)
    setSlug(slugify(v))
  }

  // Debounced check at slug change
  useEffect(() => {
    if (!slug) {
      setSlugCheck({ status: "idle" })
      return
    }
    setSlugCheck({ status: "checking" })
    const t = setTimeout(async () => {
      try {
        const result = await checkSlugAvailable(slug)
        setSlugCheck({ status: "result", result })
      } catch {
        setSlugCheck({ status: "idle" })
      }
    }, 400)
    return () => clearTimeout(t)
  }, [slug])

  if (created) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Check className="h-6 w-6 text-emerald-600" />
          <h2 className="text-lg font-semibold text-emerald-900">Организация создана</h2>
        </div>
        <p className="text-sm text-emerald-800">Передайте эти данные владельцу:</p>
        <div className="bg-white rounded-lg border border-emerald-200 p-4 font-mono text-sm space-y-2">
          {created.ownerEmail && <div>Логин (email): <b>{created.ownerEmail}</b></div>}
          {created.ownerPhone && <div>Логин (телефон): <b>{created.ownerPhone}</b></div>}
          <div>Временный пароль: <b>{created.tempPassword}</b></div>
          <div>URL входа: <b>https://commrent.kz/login</b></div>
          <div>Рабочая зона: <b>https://{created.slug}.commrent.kz</b></div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const text = `Логин: ${created.ownerEmail || created.ownerPhone}\nПароль: ${created.tempPassword}\nURL входа: https://commrent.kz/login\nРабочая зона: https://${created.slug}.commrent.kz`
              navigator.clipboard.writeText(text)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            {copied ? <><Check className="h-3.5 w-3.5" /> Скопировано</> : <><Copy className="h-3.5 w-3.5" /> Копировать всё</>}
          </button>
          <button
            onClick={() => router.push(`/superadmin/orgs/${created.orgId}`)}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Перейти к организации
          </button>
          <button
            onClick={() => {
              setCreated(null)
              setName("")
              setSlug("")
              setSlugTouched(false)
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Создать ещё
          </button>
        </div>
      </div>
    )
  }

  const checkResult = slugCheck.status === "result" ? slugCheck.result : undefined
  const isSlugOk = checkResult?.ok === true
  const isSlugBad = checkResult && !checkResult.ok
  const canSubmit = name.trim().length > 0 && slug.length > 0 && (slugCheck.status === "idle" || isSlugOk)

  return (
    <form
      action={(fd) => {
        fd.set("slug", slug)
        startTransition(async () => {
          try {
            const result = await createOrganization(fd)
            setCreated({ ...result, slug })
            toast.success("Организация создана!")
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Ошибка")
          }
        })
      }}
      className="bg-white rounded-xl border border-slate-200 p-6 space-y-5"
    >
      <Section title="Организация">
        <Field label="Название *" name="name" value={name} onChange={autoSlug} required placeholder='БЦ "Plaza"' />

        {/* Slug с live-проверкой */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Поддомен (slug) *
          </label>
          <div className="relative">
            <input
              value={slug}
              onChange={(e) => manualSlug(e.target.value)}
              required
              maxLength={20}
              placeholder="plaza"
              className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm font-mono lowercase focus:outline-none focus:ring-2 transition ${
                isSlugOk
                  ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                  : isSlugBad
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                  : "border-slate-200 focus:border-purple-500 focus:ring-purple-500/20"
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {slugCheck.status === "checking" && <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />}
              {isSlugOk && <Check className="h-4 w-4 text-emerald-600" />}
              {isSlugBad && <AlertCircle className="h-4 w-4 text-red-500" />}
            </div>
          </div>

          {/* Hint / preview / error */}
          {!slug && (
            <p className="text-[11px] text-slate-400 mt-1">5–20 символов: латиница нижнего регистра, цифры, дефис</p>
          )}
          {isSlugOk && checkResult && checkResult.ok && (
            <p className="text-[11px] mt-1 flex items-center gap-1 text-emerald-700">
              <Check className="h-3 w-3" />
              Доступен. Будет:{" "}
              <a href={checkResult.url} target="_blank" rel="noopener noreferrer" className="font-mono text-emerald-700 hover:underline inline-flex items-center gap-0.5">
                {checkResult.url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          )}
          {isSlugBad && checkResult && !checkResult.ok && (
            <div className="mt-1 space-y-1">
              <p className="text-[11px] text-red-600">{checkResult.reason}</p>
              {checkResult.suggestions && checkResult.suggestions.length > 0 && (
                <p className="text-[11px] text-slate-500">
                  Свободные варианты:{" "}
                  {checkResult.suggestions.map((s, i) => (
                    <span key={s}>
                      <button
                        type="button"
                        onClick={() => { setSlugTouched(true); setSlug(s) }}
                        className="font-mono text-blue-600 hover:underline"
                      >
                        {s}
                      </button>
                      {i < checkResult.suggestions!.length - 1 && ", "}
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Тариф *</label>
            <select name="planId" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.priceMonthly.toLocaleString("ru-RU")} ₸/мес
                  {p.maxBuildings ? ` · до ${p.maxBuildings} зданий` : " · ∞ зданий"}
                </option>
              ))}
            </select>
          </div>
          <Field label="Срок (мес)" name="months" type="number" defaultValue="1" />
        </div>
      </Section>

      <Section title="Владелец организации">
        <Field label="ФИО *" name="ownerName" required placeholder="Иванов Иван Иванович" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" name="ownerEmail" type="email" placeholder="ivan@plaza.kz" />
          <Field label="Телефон" name="ownerPhone" placeholder="+7..." />
        </div>
        <Field
          label="Временный пароль"
          name="ownerPassword"
          placeholder="Оставьте пустым — сгенерируем"
          hint="Если оставить пустым, система сгенерирует надёжный пароль"
        />
      </Section>

      <button
        type="submit"
        disabled={pending || !canSubmit}
        className="w-full rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Создание..." : "Создать организацию"}
      </button>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  )
}

function Field({
  label, name, type = "text", value, onChange, defaultValue, required, placeholder, hint,
}: {
  label: string
  name?: string
  type?: string
  value?: string
  onChange?: (v: string) => void
  defaultValue?: string
  required?: boolean
  placeholder?: string
  hint?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
      />
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
