"use client"

import { useState, useTransition } from "react"
import { useT } from "@/lib/i18n/client"
import { Check } from "lucide-react"
import { createBookingLead } from "@/app/actions/booking"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { KzPhoneInput, AsciiEmailInput } from "@/components/forms/contact-inputs"

export function BookingForm({
  orgSlug,
  buildings,
}: {
  orgSlug: string
  buildings: { id: string; name: string }[]
}) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (submitted) {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm">
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-900">{t("auth.booking.sentTitle")}</p>
            <p className="text-emerald-700 text-xs mt-1">
              {t("auth.booking.sentText")}
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
          else setErr(r.error ?? t("auth.booking.sendFailed"))
        })
      }}
      className="space-y-3"
    >
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t("auth.booking.name")}</label>
        <Input
          name="name"
          required
          maxLength={100}
          placeholder={t("auth.booking.formTitle")}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t("auth.booking.phone")}</label>
        <KzPhoneInput
          name="phone"
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
        <AsciiEmailInput
          name="email"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      {buildings.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("auth.booking.building")}</label>
          <select
            name="buildingId"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">{t("auth.booking.anyBuilding")}</option>
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
        <label className="block text-xs font-medium text-slate-600 mb-1">{t("auth.booking.looking")}</label>
        <Textarea
          name="comment"
          rows={2}
          maxLength={500}
          placeholder={t("auth.booking.lookingPlaceholder")}
          className="resize-none"
        />
      </div>

      {err && (
        <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>
      )}

      <Button
        type="submit"
        size="lg"
        loading={pending}
        className="w-full font-semibold"
      >
        {pending ? t("auth.booking.submitting") : t("auth.booking.submit")}
      </Button>
      <p className="text-[10px] text-slate-400 text-center">
        {t("auth.booking.consent")}
      </p>
    </form>
  )
}
