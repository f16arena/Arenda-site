"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Mail, Send, Bell, Check } from "lucide-react"
import {
  updateMyNotificationSettings,
  type NotificationSettings,
} from "@/app/actions/notification-settings"

const NOTIFICATION_TYPES: { type: string; label: string; description: string }[] = [
  { type: "PAYMENT_DUE", label: "Платежи и счета", description: "Просрочки, ожидаемые платежи, поступления" },
  { type: "CONTRACT_EXPIRING", label: "Договоры", description: "Истечение договоров, продление" },
  { type: "DOCUMENT_INVOICE", label: "Документы", description: "Новые счета, акты, договоры" },
  { type: "NEW_REQUEST", label: "Заявки", description: "Новые заявки на обслуживание" },
  { type: "REQUEST_STATUS_CHANGED", label: "Статус заявки", description: "Изменения статусов заявок" },
  { type: "MESSAGE_RECEIVED", label: "Сообщения", description: "Личные и общие сообщения" },
]

export function NotificationSettingsForm({ initial }: { initial: NotificationSettings }) {
  const [settings, setSettings] = useState<NotificationSettings>(initial)
  const [pending, startTransition] = useTransition()

  function save(next: Partial<NotificationSettings>) {
    setSettings((s) => ({ ...s, ...next }))
    startTransition(async () => {
      const r = await updateMyNotificationSettings(next)
      if (r.ok) toast.success("Настройки сохранены")
      else toast.error(r.error ?? "Ошибка")
    })
  }

  function toggleChannel(channel: "notifyEmail" | "notifyTelegram" | "notifyInApp") {
    save({ [channel]: !settings[channel] })
  }

  function toggleType(type: string) {
    const isMuted = settings.mutedTypes.includes(type)
    const next = isMuted
      ? settings.mutedTypes.filter((t) => t !== type)
      : [...settings.mutedTypes, type]
    save({ mutedTypes: next })
  }

  return (
    <div className="space-y-5">
      {/* Каналы */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Каналы доставки</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Где получать уведомления</p>
        </div>
        <div className="divide-y divide-slate-50">
          <ChannelRow
            icon={Bell}
            color="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10"
            label="В приложении"
            description="Колокольчик в шапке"
            enabled={settings.notifyInApp}
            onToggle={() => toggleChannel("notifyInApp")}
            disabled={pending}
          />
          <ChannelRow
            icon={Mail}
            color="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10"
            label="Email"
            description="На вашу электронную почту"
            enabled={settings.notifyEmail}
            onToggle={() => toggleChannel("notifyEmail")}
            disabled={pending}
          />
          <ChannelRow
            icon={Send}
            color="text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10"
            label="Telegram"
            description="В привязанный аккаунт Telegram"
            enabled={settings.notifyTelegram}
            onToggle={() => toggleChannel("notifyTelegram")}
            disabled={pending}
          />
        </div>
      </div>

      {/* Типы событий */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">События</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
            Снимите галочку чтобы отключить уведомления о выбранных событиях
          </p>
        </div>
        <div className="divide-y divide-slate-50">
          {NOTIFICATION_TYPES.map((t) => {
            const isEnabled = !settings.mutedTypes.includes(t.type)
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => toggleType(t.type)}
                disabled={pending}
                className="w-full px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition text-left disabled:opacity-60"
              >
                <div className={`flex h-5 w-5 items-center justify-center rounded border-2 shrink-0 ${
                  isEnabled
                    ? "bg-slate-900 border-slate-900"
                    : "bg-white dark:bg-slate-900 border-slate-300"
                }`}>
                  {isEnabled && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{t.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Изменения сохраняются автоматически.
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
        <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{description}</p>
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
