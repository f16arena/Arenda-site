"use client"

import { useState } from "react"
import { UserCircle, Lock, Mail, Bell, Phone } from "lucide-react"
import { NameBlock, EmailBlock, PasswordBlock } from "./profile-forms"

type TabKey = "general" | "security" | "email" | "notifications"

interface Props {
  currentName: string
  currentEmail: string | null
  emailVerified: boolean
  phone: string | null
  notificationsSlot?: React.ReactNode
}

export function ProfileTabs({
  currentName, currentEmail, emailVerified, phone, notificationsSlot,
}: Props) {
  const [tab, setTab] = useState<TabKey>("general")

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-1.5 flex flex-wrap gap-1">
        <TabBtn icon={UserCircle} label="Личное" active={tab === "general"} onClick={() => setTab("general")} />
        <TabBtn icon={Mail} label="Email" active={tab === "email"} onClick={() => setTab("email")} badge={currentEmail && !emailVerified ? "!" : undefined} />
        <TabBtn icon={Lock} label="Безопасность" active={tab === "security"} onClick={() => setTab("security")} />
        {notificationsSlot && (
          <TabBtn icon={Bell} label="Уведомления" active={tab === "notifications"} onClick={() => setTab("notifications")} />
        )}
      </div>

      {/* Content */}
      {tab === "general" && (
        <div className="space-y-5">
          <NameBlock currentName={currentName} />
          {phone !== undefined && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                <Phone className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-900">Телефон</h2>
              </div>
              <div className="p-5 text-sm">
                {phone ? (
                  <p className="font-mono text-slate-900">{phone}</p>
                ) : (
                  <p className="text-slate-500">Не указан</p>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  Для изменения телефона свяжитесь с администратором.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "email" && (
        <EmailBlock currentEmail={currentEmail} emailVerified={emailVerified} />
      )}

      {tab === "security" && (
        <PasswordBlock />
      )}

      {tab === "notifications" && notificationsSlot && (
        <div className="space-y-5">{notificationsSlot}</div>
      )}
    </div>
  )
}

function TabBtn({
  icon: Icon, label, active, onClick, badge,
}: {
  icon: React.ElementType
  label: string
  active: boolean
  onClick: () => void
  badge?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition relative ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      {badge && (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold px-1">
          {badge}
        </span>
      )}
    </button>
  )
}
