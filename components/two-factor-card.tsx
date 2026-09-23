"use client"

import { useState, useTransition } from "react"
import { Shield, ShieldCheck, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import {
  startTotpEnrollment,
  verifyAndEnableTotp,
  disableTotp,
} from "@/app/actions/two-factor"
import { useT } from "@/lib/i18n/client"

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState<"idle" | "qr" | "backup" | "disable">("idle")
  const [enrollment, setEnrollment] = useState<{ secret: string; qrDataUrl: string } | null>(null)
  const [code, setCode] = useState("")
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [disablePassword, setDisablePassword] = useState("")
  const [copied, setCopied] = useState(false)

  const startEnroll = () => {
    startTransition(async () => {
      const r = await startTotpEnrollment()
      if (!r.ok) { toast.error(r.error); return }
      setEnrollment({ secret: r.secret, qrDataUrl: r.qrDataUrl })
      setStep("qr")
    })
  }

  const confirmEnroll = () => {
    if (!enrollment) return
    startTransition(async () => {
      const r = await verifyAndEnableTotp(enrollment.secret, code)
      if (!r.ok) { toast.error(r.error); return }
      setBackupCodes(r.backupCodes)
      setStep("backup")
      toast.success(t("common.twoFactor.enabled"))
    })
  }

  const finishEnroll = () => {
    setStep("idle")
    setEnrollment(null)
    setCode("")
    setBackupCodes(null)
  }

  const startDisable = () => setStep("disable")

  const confirmDisable = () => {
    startTransition(async () => {
      const r = await disableTotp(disablePassword)
      if (!r.ok) { toast.error(r.error); return }
      toast.success(t("common.twoFactor.disabled"))
      setStep("idle")
      setDisablePassword("")
    })
  }

  const copyCodes = () => {
    if (!backupCodes) return
    navigator.clipboard.writeText(backupCodes.join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Render
  if (enabled && step === "idle") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("common.twoFactor.title")}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("common.twoFactor.onHint")}</p>
          </div>
          <button
            onClick={startDisable}
            className="text-xs text-red-600 dark:text-red-400 hover:underline"
          >
            {t("common.twoFactor.disableShort")}
          </button>
        </div>
      </div>
    )
  }

  if (step === "disable") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-500/30 p-5">
        <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">{t("common.twoFactor.disableTitle")}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t("common.twoFactor.disableHint")}</p>
        <input
          type="password"
          value={disablePassword}
          onChange={(e) => setDisablePassword(e.target.value)}
          placeholder={t("common.twoFactor.currentPassword")}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm mb-3"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={() => { setStep("idle"); setDisablePassword("") }}
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400"
          >
            {t("common.actions.cancel")}
          </button>
          <button
            onClick={confirmDisable}
            disabled={pending || !disablePassword}
            className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 text-white py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "…" : t("common.twoFactor.disableShort")}
          </button>
        </div>
      </div>
    )
  }

  if (step === "qr" && enrollment) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("common.twoFactor.step1")}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          {t("common.twoFactor.step1Hint")}
        </p>
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="bg-white p-2 rounded-lg border border-slate-200 dark:border-slate-800 self-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollment.qrDataUrl} alt="2FA QR" className="w-40 h-40" />
          </div>
          <div className="flex-1 text-xs space-y-2">
            <p className="text-slate-600 dark:text-slate-400">{t("common.twoFactor.manual")}</p>
            <code className="block bg-slate-100 dark:bg-slate-800 rounded p-2 font-mono text-[10px] break-all select-all">
              {enrollment.secret}
            </code>
            <p className="text-slate-500 dark:text-slate-400">Algorithm: SHA1, Digits: 6, Period: 30s</p>
          </div>
        </div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("common.twoFactor.step2")}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          {t("common.twoFactor.step2Hint")}
        </p>
        <input
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className="w-32 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-lg font-mono tracking-widest text-center mb-3"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={finishEnroll}
            className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm text-slate-600 dark:text-slate-400"
          >
            {t("common.actions.cancel")}
          </button>
          <button
            onClick={confirmEnroll}
            disabled={pending || code.length !== 6}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? t("common.actions.checking") : t("common.twoFactor.enable")}
          </button>
        </div>
      </div>
    )
  }

  if (step === "backup" && backupCodes) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-500/30 p-5">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">{t("common.twoFactor.backupTitle")}</p>
        <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
          {t("common.twoFactor.backupHint")}
        </p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {backupCodes.map((c) => (
            <code key={c} className="bg-slate-100 dark:bg-slate-800 rounded px-2 py-1.5 font-mono text-xs text-center select-all">
              {c}
            </code>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyCodes}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 py-2 text-sm font-medium"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? t("common.actions.copied") : t("common.twoFactor.copyAll")}
          </button>
          <button
            onClick={finishEnroll}
            className="flex-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white py-2 text-sm font-medium"
          >
            {t("common.twoFactor.saved")}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
          <Shield className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("common.twoFactor.title")}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("common.twoFactor.offHint")}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {t("common.twoFactor.why")}
      </p>
      <button
        onClick={startEnroll}
        disabled={pending}
        className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "…" : t("common.twoFactor.enable")}
      </button>
    </div>
  )
}
