export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, FileText, Calendar, ShieldCheck,
  Clock, Users, Receipt, History as HistoryIcon,
} from "lucide-react"
import { requireOrgAccess } from "@/lib/org"
import { contractScope } from "@/lib/tenant-scope"
import { assertContractInOrg } from "@/lib/scope-guards"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { contractPayloadBase64 } from "@/lib/contract-signing-payload"
import { ContractEcpSign } from "@/components/contract-ecp-sign"
import { SignedPdfButton } from "@/components/contract-constructor/signed-pdf-button"
import { AddendumActions } from "@/components/contract-constructor/addendum-actions"

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT:             { label: "Черновик",       color: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" },
  SENT:              { label: "Отправлен",      color: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  VIEWED:            { label: "Просмотрен",     color: "bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  SIGNED_BY_TENANT:  { label: "Подписал арендатор", color: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  SIGNED:            { label: "Подписан",       color: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  ACTIVE:            { label: "Действующий",    color: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  ARCHIVED:          { label: "Архивирован",    color: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400" },
  REJECTED:          { label: "Отклонён",       color: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300" },
  EXPIRED:           { label: "Истёк",          color: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300" },
}

const TYPE_LABELS: Record<string, string> = {
  STANDARD: "Стандартный договор",
  ADDENDUM: "Дополнительное соглашение",
}

const CHANGE_KIND_LABELS: Record<string, string> = {
  RENTAL_TERMS: "Изменение условий аренды",
  PROLONGATION: "Пролонгация",
  TERMINATION: "Расторжение",
  OTHER: "Прочие изменения",
}

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const { id } = await params

  try {
    await assertContractInOrg(id, orgId)
  } catch {
    notFound()
  }

  const contract = await db.contract.findFirst({
    where: { id, ...contractScope(orgId) },
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      content: true,
      signedAt: true,
      sentAt: true,
      viewedAt: true,
      signedByTenantAt: true,
      signedByTenantName: true,
      signedByLandlordAt: true,
      rejectedAt: true,
      rejectionReason: true,
      startDate: true,
      endDate: true,
      effectiveDate: true,
      appliedAt: true,
      version: true,
      parentContractId: true,
      parentVersionId: true,
      changeKind: true,
      createdAt: true,
      builderState: true,
      tenant: {
        select: {
          id: true,
          companyName: true,
          legalType: true,
        },
      },
      parentContract: {
        select: { id: true, number: true, type: true },
      },
      parentVersion: {
        select: { id: true, number: true, version: true },
      },
      addenda: {
        select: { id: true, number: true, status: true, createdAt: true, changeKind: true },
        orderBy: { createdAt: "desc" },
      },
      versions: {
        select: { id: true, number: true, version: true, status: true, createdAt: true },
        orderBy: { version: "desc" },
      },
      _count: { select: { charges: true } },
    },
  })

  if (!contract) notFound()

  const statusMeta = STATUS_LABELS[contract.status] ?? { label: contract.status, color: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" }
  const isAddendum = contract.type === "ADDENDUM"
  const isCompleted = contract.status === "SIGNED" || contract.status === "REJECTED"
  const canLandlordSign = !isCompleted && !contract.signedByLandlordAt
  const landlordPayloadB64 = canLandlordSign
    ? contractPayloadBase64({
        number: contract.number,
        type: contract.type,
        content: contract.content,
        startDate: contract.startDate,
        endDate: contract.endDate,
        tenantCompany: contract.tenant.companyName,
      })
    : null

  return (
    <div className="space-y-5 max-w-5xl">
      <Breadcrumbs
        items={[
          { label: "Главная", href: "/admin" },
          { label: "Договоры", href: "/admin/contracts" },
          { label: `№ ${contract.number}` },
        ]}
      />

      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/admin/contracts"
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">
              {TYPE_LABELS[contract.type] ?? contract.type} № {contract.number}
            </h1>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusMeta.color}`}>
              {statusMeta.label}
            </span>
            {contract.version > 1 && (
              <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                Версия {contract.version}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Арендатор:{" "}
            <Link
              href={`/admin/tenants/${contract.tenant.id}`}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {contract.tenant.companyName}
            </Link>
            {" · создан "}
            {contract.createdAt.toLocaleDateString("ru-RU")}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {/* Скачивание — строго PDF (Word наружу не отдаём). */}
          {contract.builderState ? (
            <SignedPdfButton contractId={contract.id} />
          ) : (
            <p className="max-w-[14rem] text-[11px] text-slate-400 dark:text-slate-500">
              PDF доступен для договоров из конструктора.
            </p>
          )}
          {landlordPayloadB64 && (
            <ContractEcpSign
              payloadB64={landlordPayloadB64}
              mode="landlord"
              contractId={contract.id}
              label="Подписать ЭЦП (арендодатель)"
            />
          )}
        </div>
      </div>

      {contract.status === "SIGNED" && contract.type !== "ADDENDUM" && (
        <Section title="Дополнительные соглашения" icon={FileText}>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Продлите срок или расторгните договор — ДС уйдёт арендатору на подпись.</p>
          <AddendumActions contractId={contract.id} />
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Левая колонка: контент + история */}
        <div className="space-y-5 lg:col-span-2">
          {/* Период */}
          <Section title="Период действия" icon={Calendar}>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Начало</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {contract.startDate ? contract.startDate.toLocaleDateString("ru-RU") : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Окончание</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {contract.endDate ? contract.endDate.toLocaleDateString("ru-RU") : "—"}
                </p>
              </div>
              {isAddendum && contract.effectiveDate && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Дата вступления в силу (ДС)</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {contract.effectiveDate.toLocaleDateString("ru-RU")}
                    {contract.appliedAt && (
                      <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                        ✓ применено {contract.appliedAt.toLocaleDateString("ru-RU")}
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </Section>

          {/* Workflow подписания */}
          <Section title="Workflow подписания" icon={Clock}>
            <ul className="space-y-2 text-sm">
              <WorkflowItem label="Создан" date={contract.createdAt} done />
              <WorkflowItem label="Отправлен арендатору" date={contract.sentAt} />
              <WorkflowItem label="Открыт арендатором" date={contract.viewedAt} />
              <WorkflowItem
                label="Подписан арендатором"
                date={contract.signedByTenantAt}
                hint={contract.signedByTenantName ?? undefined}
              />
              <WorkflowItem label="Подписан арендодателем" date={contract.signedByLandlordAt} />
              <WorkflowItem label="Подписан (обе стороны)" date={contract.signedAt} />
              {contract.rejectedAt && (
                <WorkflowItem
                  label="Отклонён"
                  date={contract.rejectedAt}
                  hint={contract.rejectionReason ?? undefined}
                  isError
                />
              )}
            </ul>
          </Section>

          {/* Содержимое */}
          <Section title="Содержимое договора" icon={FileText}>
            <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 font-sans leading-relaxed max-h-[600px] overflow-y-auto">
              {contract.content || "(пусто)"}
            </pre>
          </Section>
        </div>

        {/* Правая колонка: связи + статистика */}
        <div className="space-y-5">
          {/* Связи (родитель/предок) */}
          {(contract.parentContract || contract.parentVersion) && (
            <Section title="Связи" icon={Users}>
              {contract.parentContract && (
                <div className="text-sm">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Основной договор</p>
                  <Link
                    href={`/admin/contracts/${contract.parentContract.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    № {contract.parentContract.number} ({TYPE_LABELS[contract.parentContract.type] ?? contract.parentContract.type})
                  </Link>
                </div>
              )}
              {contract.parentVersion && (
                <div className="text-sm mt-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Предыдущая версия</p>
                  <Link
                    href={`/admin/contracts/${contract.parentVersion.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    № {contract.parentVersion.number} (v{contract.parentVersion.version})
                  </Link>
                </div>
              )}
            </Section>
          )}

          {/* Версии */}
          {contract.versions.length > 0 && (
            <Section title={`Версии (${contract.versions.length})`} icon={HistoryIcon}>
              <ul className="space-y-2 text-sm">
                {contract.versions.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/admin/contracts/${v.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 hover:border-blue-300 hover:bg-blue-50/30 dark:hover:bg-blue-500/10"
                    >
                      <span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">v{v.version}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
                          {v.createdAt.toLocaleDateString("ru-RU")}
                        </span>
                      </span>
                      <span className={`text-xs rounded px-1.5 py-0.5 ${STATUS_LABELS[v.status]?.color ?? "bg-slate-100"}`}>
                        {STATUS_LABELS[v.status]?.label ?? v.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Доп. соглашения */}
          {contract.addenda.length > 0 && (
            <Section title={`Доп. соглашения (${contract.addenda.length})`} icon={ShieldCheck}>
              <ul className="space-y-2 text-sm">
                {contract.addenda.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/admin/contracts/${a.id}`}
                      className="flex flex-col gap-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 hover:border-blue-300 hover:bg-blue-50/30 dark:hover:bg-blue-500/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          ДС № {a.number}
                        </span>
                        <span className={`text-xs rounded px-1.5 py-0.5 ${STATUS_LABELS[a.status]?.color ?? "bg-slate-100"}`}>
                          {STATUS_LABELS[a.status]?.label ?? a.status}
                        </span>
                      </div>
                      {a.changeKind && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {CHANGE_KIND_LABELS[a.changeKind] ?? a.changeKind}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {a.createdAt.toLocaleDateString("ru-RU")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Статистика начислений */}
          <Section title="Начисления" icon={Receipt}>
            <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {contract._count.charges}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              записей привязано к этому договору
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof FileText
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function WorkflowItem({
  label,
  date,
  hint,
  done,
  isError,
}: {
  label: string
  date: Date | null
  hint?: string
  done?: boolean
  isError?: boolean
}) {
  const has = done || date !== null
  const dotClass = isError
    ? "bg-red-500"
    : has
      ? "bg-emerald-500"
      : "bg-slate-300 dark:bg-slate-700"
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm ${has ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
            {label}
          </span>
          {date && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        {hint && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>
        )}
      </div>
    </li>
  )
}
