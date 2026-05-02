"use client"

import { useState, useTransition } from "react"
import { Check, X } from "lucide-react"
import { signContractByTenant, rejectContractByTenant } from "@/app/actions/contract-workflow"

export function SignActions({ token }: { token: string }) {
  const [pending, startTransition] = useTransition()
  const [signerName, setSignerName] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [done, setDone] = useState<"signed" | "rejected" | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const submitSign = () => {
    if (!agreed) { setErr("Подтвердите согласие с условиями"); return }
    if (signerName.trim().length < 3) { setErr("Введите ФИО полностью"); return }
    setErr(null)
    startTransition(async () => {
      const r = await signContractByTenant(token, signerName)
      if (r.ok) { setDone("signed") }
      else setErr(r.error)
    })
  }

  const submitReject = () => {
    if (rejectReason.trim().length < 5) { setErr("Опишите причину минимум в 5 символов"); return }
    setErr(null)
    startTransition(async () => {
      const r = await rejectContractByTenant(token, rejectReason)
      if (r.ok) setDone("rejected")
      else setErr(r.error)
    })
  }

  if (done === "signed") {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-emerald-900">Договор подписан</h2>
        <p className="text-sm text-emerald-700 mt-1">
          Спасибо! Арендодатель получит уведомление и подпишет в течение 1–2 рабочих дней.
        </p>
      </div>
    )
  }

  if (done === "rejected") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
          <X className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-red-900">Договор отклонён</h2>
        <p className="text-sm text-red-700 mt-1">
          Мы получили вашу причину. Свяжемся для обсуждения условий.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Подписать договор</h2>
      <p className="text-sm text-slate-600">
        Подписывая, вы соглашаетесь со всеми условиями договора. Это юридически действительно
        как простая электронная подпись по статье 7 Закона РК «Об электронном документе и ЭЦП».
      </p>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">ФИО подписанта *</label>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Иванов Иван Иванович"
          maxLength={200}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 rounded"
        />
        <span className="text-slate-700">
          Я ознакомился с текстом договора и согласен с его условиями
        </span>
      </label>

      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => setShowReject(true)}
          disabled={pending}
          className="flex-1 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 py-2.5 text-sm font-medium"
        >
          Отклонить
        </button>
        <button
          onClick={submitSign}
          disabled={pending || !agreed || signerName.length < 3}
          className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "..." : "Подписать"}
        </button>
      </div>

      {showReject && (
        <div className="border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-700 mb-2">Причина отказа</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Не согласен с пунктом X / нужно изменить срок / ..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none resize-none"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setShowReject(false)}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600"
            >
              Назад
            </button>
            <button
              onClick={submitReject}
              disabled={pending || rejectReason.length < 5}
              className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 text-white py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "..." : "Отклонить договор"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
