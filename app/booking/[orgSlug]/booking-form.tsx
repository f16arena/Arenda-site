"use client"

import { useState, useTransition } from "react"
import { Check } from "lucide-react"
import { createBookingLead } from "@/app/actions/booking"

export function BookingForm({
  orgSlug,
  buildings,
}: {
  orgSlug: string
  buildings: { id: string; name: string }[]
}) {
  const [pending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (submitted) {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm">
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-900">Заявка отправлена!</p>
            <p className="text-emerald-700 text-xs mt-1">
              Свяжемся с вами в течение часа в рабочее время.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form
      action={(fd) => {
        setErr(null)
        startTransition(async () => {
          const r = await createBookingLead(orgSlug, fd)
          if (r.ok) setSubmitted(true)
          else setErr(r.error ?? "Не удалось отправить")
        })
      }}
      className="space-y-3"
    >
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Имя *</label>
        <input
          name="name"
          required
          maxLength={100}
          placeholder="Как к вам обращаться"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Телефон *</label>
        <input
          name="phone"
          type="tel"
          required
          placeholder="+7 (___) ___-__-__"
          title="Введите номер Казахстана в формате +7 7XX XXX XX XX"
          maxLength={30}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
        <input
          name="email"
          type="email"
          maxLength={100}
          placeholder="не обязательно"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      {buildings.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Здание</label>
          <select
            name="buildingId"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">— любое —</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
      {buildings.length === 1 && (
        <input type="hidden" name="buildingId" value={buildings[0].id} />
      )}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Что ищете</label>
        <textarea
          name="comment"
          rows={2}
          maxLength={500}
          placeholder="Кабинет 30-50 м², этаж не выше 3..."
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
        />
      </div>

      {err && (
        <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? "Отправка..." : "Оставить заявку"}
      </button>
      <p className="text-[10px] text-slate-400 text-center">
        Нажимая, вы соглашаетесь с обработкой персональных данных.
      </p>
    </form>
  )
}
