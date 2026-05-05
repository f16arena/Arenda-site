export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Building2, Users, AlertTriangle, FileText, HardDrive, Wallet } from "lucide-react"
import { OrgActions, OrgEditForm, ExtendForm, ChangeOwnerForm, DangerZone } from "./client-actions"
import { OrgUrlCard } from "./org-url-card"
import { LimitsCard } from "./limits-card"
import { cn } from "@/lib/utils"
import { ROOT_HOST } from "@/lib/host"
import { tenantScope, leadScope } from "@/lib/tenant-scope"

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOwner()
  const { id } = await params

  const org = await db.organization.findUnique({
    where: { id },
    include: {
      plan: {
        select: {
          id: true, name: true, code: true, priceMonthly: true,
          maxBuildings: true, maxTenants: true, maxUsers: true, maxLeads: true,
        },
      },
      _count: { select: { buildings: true, users: true, subscriptions: true } },
    },
  })
  if (!org) notFound()

  // Реальные счётчики tenants/leads для блока лимитов
  const [
    tenantsCount,
    leadsCount,
    plans,
    ownerUser,
    allUsers,
    subscriptions,
    pendingPaymentReportsCount,
    generatedDocumentsCount,
    storedFilesCount,
    dataQualitySignalCount,
  ] = await Promise.all([
    db.tenant.count({ where: tenantScope(org.id) }).catch(() => 0),
    db.lead.count({ where: leadScope(org.id) }).catch(() => 0),
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
    db.paymentReport.count({
      where: { tenant: tenantScope(org.id), status: { in: ["PENDING", "DISPUTED"] } },
    }).catch(() => 0),
    db.generatedDocument.count({ where: { organizationId: org.id } }).catch(() => 0),
    db.storedFile.count({ where: { organizationId: org.id, deletedAt: null } }).catch(() => 0),
    Promise.all([
      db.tenant.count({
        where: {
          ...tenantScope(org.id),
          AND: [
            { OR: [{ user: { email: null } }, { user: { email: "" } }] },
            { OR: [{ user: { phone: null } }, { user: { phone: "" } }] },
          ],
        },
      }),
      db.tenant.count({
        where: {
          ...tenantScope(org.id),
          OR: [{ spaceId: { not: null } }, { tenantSpaces: { some: {} } }, { fullFloors: { some: {} } }],
          contracts: { none: { status: "SIGNED" } },
        },
      }),
    ]).then(([missingContacts, noSignedContracts]) => missingContacts + noSignedContracts).catch(() => 0),
  ])

  const now = new Date()
  const expired = org.planExpiresAt && org.planExpiresAt < now
  const daysLeft = org.planExpiresAt
    ? Math.ceil((org.planExpiresAt.getTime() - now.getTime()) / 86_400_000)
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/superadmin/orgs" className="text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{org.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{org.slug}</p>
        </div>
        <OrgActions orgId={org.id} hasOwner={!!ownerUser} />
      </div>

      {/* URL поддомена */}
      <OrgUrlCard slug={org.slug} rootHost={ROOT_HOST} />

      {/* Status alerts */}
      {org.isSuspended && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-sm text-red-800 dark:text-red-200">Организация <b>приостановлена</b>. Клиент не может работать в системе.</p>
        </div>
      )}
      {expired && !org.isSuspended && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">Подписка <b>истекла</b>. Клиент не может создавать новые объекты.</p>
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

      {/* Лимиты тарифа */}
      <LimitsCard
        buildings={org._count.buildings}
        tenants={tenantsCount}
        users={org._count.users}
        leads={leadsCount}
        maxBuildings={org.plan?.maxBuildings ?? null}
        maxTenants={org.plan?.maxTenants ?? null}
        maxUsers={org.plan?.maxUsers ?? null}
        maxLeads={org.plan?.maxLeads ?? null}
      />

      <SupportSnapshot
        pendingPaymentReportsCount={pendingPaymentReportsCount}
        generatedDocumentsCount={generatedDocumentsCount}
        storedFilesCount={storedFilesCount}
        dataQualitySignalCount={dataQualitySignalCount}
      />

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
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{ownerUser.name}</p>
              {ownerUser.email && <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{ownerUser.email}</p>}
              {ownerUser.phone && <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 font-mono">{ownerUser.phone}</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">Владелец не назначен</p>
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
            <p className="text-sm text-slate-400 dark:text-slate-500">Нет записей</p>
          ) : (
            <div className="space-y-2">
              {subscriptions.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.plan.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {new Date(s.startedAt).toLocaleDateString("ru-RU")} → {new Date(s.expiresAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{s.paidAmount.toLocaleString("ru-RU")} ₸</p>
                    {s.paymentMethod && <p className="text-[10px] text-slate-400 dark:text-slate-500">{s.paymentMethod}</p>}
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
  const accentClass = accent === "red" ? "text-red-600 dark:text-red-400" : accent === "amber" ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <p className={cn("text-xl font-bold", accentClass)}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function SupportSnapshot({
  pendingPaymentReportsCount,
  generatedDocumentsCount,
  storedFilesCount,
  dataQualitySignalCount,
}: {
  pendingPaymentReportsCount: number
  generatedDocumentsCount: number
  storedFilesCount: number
  dataQualitySignalCount: number
}) {
  const cards = [
    {
      label: "Оплаты на проверке",
      value: pendingPaymentReportsCount,
      icon: Wallet,
      tone: pendingPaymentReportsCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Документов создано",
      value: generatedDocumentsCount,
      icon: FileText,
      tone: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Файлов в хранилище",
      value: storedFilesCount,
      icon: HardDrive,
      tone: "text-slate-900 dark:text-slate-100",
    },
    {
      label: "Сигналы качества данных",
      value: dataQualitySignalCount,
      icon: AlertTriangle,
      tone: dataQualitySignalCount > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
    },
  ]

  return (
    <Card title="Support snapshot">
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <card.icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <p className={`mt-3 text-xl font-semibold ${card.tone}`}>{card.value}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/superadmin/errors" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          Ошибки клиента
        </Link>
        <Link href="/superadmin/audit" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          Последние действия
        </Link>
      </div>
    </Card>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  )
}
