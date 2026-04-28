"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { createOrganization } from "@/app/actions/organizations"
import { Copy, Check } from "lucide-react"

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
  const [created, setCreated] = useState<{ ownerEmail: string | null; ownerPhone: string | null; tempPassword: string; orgId: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function autoSlug(s: string) {
    setName(s)
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(s))
    }
  }

  function slugify(s: string): string {
    return s.toLowerCase()
      .replace(/[а-я]/g, (c) => translit[c] ?? "")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "")
  }

  if (created) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Check className="h-6 w-6 text-emerald-600" />
          <h2 className="text-lg font-semibold text-emerald-900">Организация создана</h2>
        </div>
        <p className="text-sm text-emerald-800">
          Передайте эти данные владельцу организации:
        </p>
        <div className="bg-white rounded-lg border border-emerald-200 p-4 font-mono text-sm space-y-2">
          {created.ownerEmail && <div>Логин (email): <b>{created.ownerEmail}</b></div>}
          {created.ownerPhone && <div>Логин (телефон): <b>{created.ownerPhone}</b></div>}
          <div>Временный пароль: <b>{created.tempPassword}</b></div>
          <div>URL для входа: <b>https://arenda-site-two.vercel.app/login</b></div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const text = `Логин: ${created.ownerEmail || created.ownerPhone}\nПароль: ${created.tempPassword}\nURL: https://arenda-site-two.vercel.app/login`
              navigator.clipboard.writeText(text)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            {copied ? <><Check className="h-3.5 w-3.5" /> Скопировано</> : <><Copy className="h-3.5 w-3.5" /> Копировать</>}
          </button>
          <button
            onClick={() => router.push(`/superadmin/orgs/${created.orgId}`)}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Перейти к организации
          </button>
          <button
            onClick={() => setCreated(null)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Создать ещё одну
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      action={(fd) => {
        fd.set("slug", slug)
        startTransition(async () => {
          try {
            const result = await createOrganization(fd)
            setCreated(result)
            toast.success("Организация создана!")
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Ошибка")
          }
        })
      }}
      className="bg-white rounded-xl border border-slate-200 p-6 space-y-5"
    >
      <Section title="Организация">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Название *" name="name" value={name} onChange={autoSlug} required placeholder="БЦ Plaza" />
          <Field label="Slug *" value={slug} onChange={(v) => setSlug(slugify(v))} required placeholder="plaza" hint="латиница, цифры, дефис" />
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
        disabled={pending}
        className="w-full rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
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
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
      />
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

const translit: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
}
