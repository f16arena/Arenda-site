export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { requireOrgAccess } from "@/lib/org"
import { assertUserInOrg } from "@/lib/scope-guards"
import { ROLE_COLORS, cn } from "@/lib/utils"
import {
  ArrowLeft, Mail, Phone, Briefcase, Wallet,
  CheckCircle, AlertCircle, Calendar, History,
} from "lucide-react"
import { StaffEditForm } from "./staff-edit-form"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { safeServerValue } from "@/lib/server-fallback"
import { getT, getLocale } from "@/lib/i18n/server"
import { formatMoneyL, formatDateL, formatDateShortL } from "@/lib/i18n/format"

// Системные роли: подписи из словаря, свои должности — как есть.
const STAFF_ROLE_KEYS = ["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"] as const

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const { t } = await getT()
  const locale = await getLocale()
  const roleLabel = (role: string) =>
    STAFF_ROLE_KEYS.includes(role as (typeof STAFF_ROLE_KEYS)[number])
      ? t(`adminSettings.staff.roles.${role as (typeof STAFF_ROLE_KEYS)[number]}`)
      : role
  // Гранулярные права: форма редактирования сотрудника (изменение/смена пароля/
  // увольнение) показывается только при наличии права users.edit.
  const caps = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: !!session.user.isPlatformOwner,
    orgId,
  }))
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/staff/[id]", orgId, userId: session.user.id, entity: "user" })
  const { id } = await params

  try {
    await assertUserInOrg(id, orgId)
  } catch {
    notFound()
  }

  const user = await db.user.findUnique({
    where: { id },
    include: {
      staff: {
        include: {
          salaryPayments: {
            orderBy: { createdAt: "desc" },
            take: 12,
          },
        },
      },
    },
  })

  if (!user) notFound()

  const isCurrentUser = session.user.id === user.id

  // Audit logs (последние действия этого юзера)
  const auditLogs = await safe(
    "admin.staff.auditLogs",
    db.auditLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, action: true, entity: true, entityId: true, createdAt: true, details: true,
      },
    }),
    [],
  )

  // Прочитаны/непрочитаны сообщения
  const [unreadMessages, totalNotifications] = await Promise.all([
    db.message.count({
      where: { toId: user.id, isRead: false },
    }).catch(() => 0),
    db.notification.count({
      where: { userId: user.id, isRead: false },
    }).catch(() => 0),
  ])

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/staff"
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("adminSettings.staff.detail.back")}
        </Link>
      </div>

      <div className="flex items-start gap-4">
        <div className="h-16 w-16 rounded-2xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
          <span className="text-xl font-bold text-slate-700 dark:text-slate-300">
            {user.name[0]?.toUpperCase()}
          </span>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">{user.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", ROLE_COLORS[user.role])}>
              {roleLabel(user.role)}
            </span>
            {user.staff?.position && (
              <span className="text-sm text-slate-500 dark:text-slate-400">· {user.staff.position}</span>
            )}
            {!user.isActive && (
              <span className="text-xs text-red-600 dark:text-red-400 font-medium">{t("adminSettings.staff.detail.dismissedBadge")}</span>
            )}
            {isCurrentUser && (
              <Link
                href="/admin/profile"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-2"
              >
                {t("adminSettings.staff.detail.yourProfile")}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={Mail} label={t("adminSettings.staff.detail.email")} value={user.email ?? "—"} muted={!user.email} />
        <Stat icon={Phone} label={t("adminSettings.staff.detail.phone")} value={user.phone ?? "—"} muted={!user.phone} />
        <Stat
          icon={Wallet}
          label={t("adminSettings.staff.detail.salary")}
          value={user.staff ? formatMoneyL(locale, user.staff.salary) : "—"}
          muted={!user.staff}
        />
        <Stat
          icon={Calendar}
          label={t("adminSettings.staff.detail.since")}
          value={formatDateL(locale, user.createdAt)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Edit form */}
        <div className="lg:col-span-2 space-y-5">
          {caps.has("users.edit") && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                {t("adminSettings.staff.detail.dataTitle")}
              </h2>
            </div>
            <div className="p-5">
              <StaffEditForm
                userId={user.id}
                staffId={user.staff?.id ?? null}
                initial={{
                  name: user.name,
                  phone: user.phone,
                  email: user.email,
                  role: user.role,
                  position: user.staff?.position ?? "",
                  salary: user.staff?.salary ?? 0,
                  isActive: user.isActive,
                }}
                isCurrentUser={isCurrentUser}
              />
            </div>
          </div>
          )}

          {/* Salary history */}
          {user.staff && user.staff.salaryPayments.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.staff.detail.salaryHistory")}</h2>
              </div>
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminSettings.staff.detail.period")}</th>
                    <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminSettings.staff.detail.amount")}</th>
                    <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminSettings.staff.detail.status")}</th>
                    <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminSettings.staff.detail.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {user.staff.salaryPayments.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50">
                      <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300">{p.period}</td>
                      <td className="px-5 py-2.5 text-right font-medium">{formatMoneyL(locale, p.amount)}</td>
                      <td className="px-5 py-2.5">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          p.status === "PAID" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300"
                        )}>
                          {p.status === "PAID" ? t("adminSettings.staff.salaryPaid") : t("adminSettings.staff.salaryPending")}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateShortL(locale, p.paidAt ?? p.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.staff.detail.activity")}</h2>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t("adminSettings.staff.detail.emailVerified")}</span>
                {user.emailVerifiedAt ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {formatDateShortL(locale, user.emailVerifiedAt)}
                  </span>
                ) : user.email ? (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {t("adminSettings.staff.detail.emailNotVerified")}
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 text-xs">{t("adminSettings.staff.detail.noEmail")}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t("adminSettings.staff.detail.telegram")}</span>
                {user.telegramChatId ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {t("adminSettings.staff.detail.connected")}
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 text-xs">{t("adminSettings.staff.detail.notConnected")}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t("adminSettings.staff.detail.unreadMessages")}</span>
                <span className="text-slate-900 dark:text-slate-100 font-medium">{unreadMessages}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t("adminSettings.staff.detail.unreadNotifications")}</span>
                <span className="text-slate-900 dark:text-slate-100 font-medium">{totalNotifications}</span>
              </div>
            </div>
          </div>

          {/* Recent audit logs */}
          {auditLogs.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                <History className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.staff.detail.recentActions")}</h2>
              </div>
              <ul className="divide-y divide-slate-50 dark:divide-slate-800 max-h-80 overflow-y-auto">
                {auditLogs.map((log) => (
                  <li key={log.id} className="px-5 py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700 dark:text-slate-300">
                        <b>{log.action}</b> · {log.entity}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500">
                        {new Date(log.createdAt).toLocaleString(locale === "kk" ? "kk-KZ" : "ru-RU", {
                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, muted }: {
  icon: React.ElementType
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-sm font-semibold truncate ${muted ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
        {value}
      </p>
    </div>
  )
}
