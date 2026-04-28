export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Building2, Users, Calendar, AlertTriangle } from "lucide-react"
import { OrgActions, OrgEditForm, ExtendForm, ChangeOwnerForm, DangerZone } from "./client-actions"
import { cn } from "@/lib/utils"

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOwner()
  const { id } = await params

  const org = await db.organization.findUnique({
    where: { id },
    include: {
      plan: { select: { id: true, name: true, code: true, priceMonthly: true } },
      _count: { select: { buildings: true, users: true, subscriptions: true } },
    },
  })
  if (!org) notFound()

  const [plans, ownerUser, allUsers, subscriptions] = await Promise.all([
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    org.ownerUserId ? db.user.findUnique({
      where: { id: org.ownerUserId },
      select: { id: true, name: true, email: true, phone: true },
    }) : null,
    db.user.findMany({
      where: { organizationId: id, isActive: true, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true, name: true, email: true, phone: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.subscription.findMany({
      where: { organizationId: id },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { plan: { select: { name: true, code: true } } },
    }),
  ])

  const now = new Date()
  const expired = org.planExpiresAt && org.planExpiresAt < now
  const daysLeft = org.planExpiresAt
    ? Math.ceil((org.planExpiresAt.getTime() - now.getTime()) / 86_400_000)
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/superadmin/orgs" className="text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">{org.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5 font-mono">{org.slug}</p>
        </div>
        <OrgActions orgId={org.id} hasOwner={!!ownerUser} />
      </div>

      {/* Status alerts */}
      {org.isSuspended && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800">Организация <b>приостановлена</b>. Клиент не может работать в системе.</p>
        </div>
      )}
      {expired && !org.isSuspended && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">Подписка <b>истекла</b>. Клиент не может создавать новые объекты.</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Тариф" value={org.plan?.name ?? "—"} sub={`${org.plan?.priceMonthly?.toLocaleString("ru-RU") ?? 0} ₸/мес`} />
        <Stat label="Срок до" value={org.planExpiresAt ? new Date(org.planExpiresAt).toLocaleDateString("ru-RU") : "—"}
              sub={daysLeft !== null ? (daysLeft >= 0 ? `${daysLeft} дн. осталось` : `Просрочен ${-daysLeft} дн.`) : ""}
              accent={expired ? "red" : daysLeft !== null && daysLeft <= 7 ? "amber" : "slate"} />
        <Stat label="Зданий" value={String(org._count.buildings)} icon={Building2} />
        <Stat label="Пользователей" value={String(org._count.users)} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Edit form */}
        <Card title="Параметры организации">
          <OrgEditForm
            orgId={org.id}
            initial={{
              name: org.name,
              planId: org.planId ?? "",
              isActive: org.isActive,
              isSuspended: org.isSuspended,
            }}
            plans={plans.map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly }))}
          />
        </Card>

        {/* Extend subscription */}
        <Card title="Продлить подписку">
          <ExtendForm orgId={org.id} planPrice={org.plan?.priceMonthly ?? 0} />
        </Card>

        {/* Owner */}
        <Card title="Владелец организации">
          {ownerUser ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">{ownerUser.name}</p>
              {ownerUser.email && <p className="text-xs text-slate-500">{ownerUser.email}</p>}
              {ownerUser.phone && <p className="text-xs text-slate-500 font-mono">{ownerUser.phone}</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Владелец не назначен</p>
          )}
          <ChangeOwnerForm
            orgId={org.id}
            currentOwnerId={org.ownerUserId}
            owners={allUsers.map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role }))}
          />
        </Card>

        {/* Subscriptions history */}
        <Card title="История подписок">
          {subscriptions.length === 0 ? (
            <p className="text-sm text-slate-400">Нет записей</p>
          ) : (
            <div className="space-y-2">
              {subscriptions.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.plan.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(s.startedAt).toLocaleDateString("ru-RU")} → {new Date(s.expiresAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-emerald-600">{s.paidAmount.toLocaleString("ru-RU")} ₸</p>
                    {s.paymentMethod && <p className="text-[10px] text-slate-400">{s.paymentMethod}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Опасная зона — деактивация и удаление */}
      <DangerZone
        orgId={org.id}
        orgSlug={org.slug}
        orgName={org.name}
        isActive={org.isActive}
        buildingsCount={org._count.buildings}
        usersCount={org._count.users}
      />
    </div>
  )
}

function Stat({ label, value, sub, icon: Icon, accent }: {
  label: string
  value: string
  sub?: string
  icon?: React.ElementType
  accent?: "red" | "amber" | "slate"
}) {
  const accentClass = accent === "red" ? "text-red-600" : accent === "amber" ? "text-amber-600" : "text-slate-900"
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <p className={cn("text-xl font-bold", accentClass)}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  )
}
