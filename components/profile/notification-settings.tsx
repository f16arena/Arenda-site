"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Mail, Send, Bell, Check, MessageCircle } from "lucide-react"
import {
  updateMyNotificationSettings,
  type NotificationSettings,
} from "@/app/actions/notification-settings"
import { useT } from "@/lib/i18n/client"

// Тип события и ключ его подписи в словаре: сам текст живёт там,
// здесь остаётся только связь с кодом события из базы.
const NOTIFICATION_TYPES: { type: string; key: string }[] = [
  { type: "PAYMENT_DUE", key: "paymentDue" },
  { type: "CONTRACT_EXPIRING", key: "contractExpiring" },
  { type: "DOCUMENT_INVOICE", key: "documentInvoice" },
  { type: "NEW_REQUEST", key: "newRequest" },
  { type: "REQUEST_STATUS_CHANGED", key: "requestStatus" },
  { type: "MESSAGE_RECEIVED", key: "messageReceived" },
]

export function NotificationSettingsForm({ initial }: { initial: NotificationSettings }) {
  const { t } = useT()
  const [settings, setSettings] = useState<NotificationSettings>(initial)
  const [pending, startTransition] = useTransition()

  function save(next: Partial<NotificationSettings>) {
    setSettings((s) => ({ ...s, ...next }))
    startTransition(async () => {
      const r = await updateMyNotificationSettings(next)
      if (r.ok) toast.success(t("common.profile.settingsSaved"))
      else toast.error(r.error ?? t("common.state.error"))
    })
  }

  function toggleChannel(channel: "notifyEmail" | "notifyTelegram" | "notifyInApp" | "notifySms") {
    save({ [channel]: !settings[channel] })
  }

  function toggleType(type: string) {
    const isMuted = settings.mutedTypes.includes(type)
    const next = isMuted
      ? settings.mutedTypes.filter((muted) => muted !== type)
      : [...settings.mutedTypes, type]
    save({ mutedTypes: next })
  }

  return (
    <div className="space-y-5">
      {/* Каналы */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("common.profile.channels")}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t("common.profile.channelsHint")}
          </p>
        </div>
        <div className="divide-y divide-slate-50 dark:divide-slate-800">
          <ChannelRow
            icon={Bell}
            color="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10"
            label={t("common.profile.channelInApp")}
            description={t("common.profile.channelInAppHint")}
            enabled={settings.notifyInApp}
            onToggle={() => toggleChannel("notifyInApp")}
            disabled={pending}
          />
          <ChannelRow
            icon={Mail}
            color="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10"
            label="Email"
            description={t("common.profile.channelEmailHint")}
            enabled={settings.notifyEmail}
            onToggle={() => toggleChannel("notifyEmail")}
            disabled={pending}
          />
          <ChannelRow
            icon={Send}
            color="text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10"
            label="Telegram"
            description={t("common.profile.channelTelegramHint")}
            enabled={settings.notifyTelegram}
            onToggle={() => toggleChannel("notifyTelegram")}
            disabled={pending}
          />
          <ChannelRow
            icon={MessageCircle}
            color="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
            label="SMS"
            description={t("common.profile.channelSmsHint")}
            enabled={settings.notifySms}
            onToggle={() => toggleChannel("notifySms")}
            disabled={pending}
          />
        </div>
      </div>

      {/* Типы событий */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("common.profile.events")}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t("common.profile.eventsHint")}
          </p>
        </div>
        <div className="divide-y divide-slate-50 dark:divide-slate-800">
          {NOTIFICATION_TYPES.map((row) => {
            const isEnabled = !settings.mutedTypes.includes(row.type)
            return (
              <button
                key={row.type}
                type="button"
                onClick={() => toggleType(row.type)}
                disabled={pending}
                className="w-full px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left disabled:opacity-60"
              >
                <div className={`flex h-5 w-5 items-center justify-center rounded border-2 shrink-0 ${
                  isEnabled
                    ? "bg-slate-900 border-slate-900"
                    : "bg-white dark:bg-slate-900 border-slate-300"
                }`}>
                  {isEnabled && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t(`common.profile.eventTypes.${row.key}` as "common.profile.eventTypes.paymentDue")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t(
                      `common.profile.eventTypes.${row.key}Hint` as "common.profile.eventTypes.paymentDueHint",
                    )}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        {t("common.profile.autoSaved")}
      </p>
    </div>
  )
}

function ChannelRow({
  icon: Icon, color, label, description, enabled, onToggle, disabled,
}: {
  icon: React.ElementType
  color: string
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          enabled ? "bg-emerald-600" : "bg-slate-200"
        } disabled:opacity-60`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-slate-900 transition ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  )
}
