export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, FileText, Calendar, ShieldCheck,
  Clock, Users, Receipt, History as HistoryIcon, ChevronDown,
} from "lucide-react"
import { requireOrgAccess } from "@/lib/org"
import { contractScope } from "@/lib/tenant-scope"
import { assertContractInOrg } from "@/lib/scope-guards"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { contractPayloadBase64 } from "@/lib/contract-signing-payload"
import { contractTypeShort } from "@/lib/contract-placement-types"
import { renderContractText, type ContractState } from "@/lib/contract-engine"
import { ContractEcpSign } from "@/components/contract-ecp-sign"
import { SignedPdfButton } from "@/components/contract-constructor/signed-pdf-button"
import { SendForSignatureButton } from "@/components/contract-constructor/send-for-signature-button"
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

const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("ru-RU") : "—")

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
      id: true, number: true, type: true, placementType: true, status: true, content: true,
      signedAt: true, sentAt: true, viewedAt: true,
      signedByTenantAt: true, signedByTenantName: true, signedByLandlordAt: true,
      rejectedAt: true, rejectionReason: true,
      startDate: true, endDate: true, effectiveDate: true, appliedAt: true,
      version: true, parentContractId: true, parentVersionId: true, changeKind: true,
      createdAt: true, builderState: true,
      tenant: { select: { id: true, companyName: true, legalType: true } },
      parentContract: { select: { id: true, number: true, type: true } },
      parentVersion: { select: { id: true, number: true, version: true } },
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
  // Полный текст с приложениями — из снимка конструктора (для старых договоров,
  // где приложений нет в сохранённом content). Иначе — content как есть.
  let fullContractText = contract.content
  if (contract.builderState) {
    try { fullContractText = renderContractText(contract.builderState as unknown as ContractState) } catch { fullContractText = contract.content }
  }
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

  const steps = [
    { label: "Создан", date: contract.createdAt },
    { label: "Отправлен", date: contract.sentAt },
    { label: "Открыт", date: contract.viewedAt },
    { label: "Подписан арендатором", date: contract.signedByTenantAt, hint: contract.signedByTenantName ?? undefined },
    { label: "Подписан арендодателем", date: contract.signedByLandlordAt },
    { label: "Готов — обе стороны", date: contract.signedAt },
  ]

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: "Главная", href: "/admin" },
          { label: "Договоры", href: "/admin/contracts" },
          { label: `№ ${contract.number}` },
        ]}
      />

      {/* Шапка-карточка */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <Link href="/admin/contracts" className="mb-3 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
          <ArrowLeft className="h-3.5 w-3.5" /> К списку договоров
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">
                {TYPE_LABELS[contract.type] ?? contract.type} № {contract.number}
              </h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusMeta.color}`}>{statusMeta.label}</span>
              {contract.placementType && !isAddendum && (
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                  {contractTypeShort(contract.placementType)}
                </span>
              )}
              {contract.version > 1 && (
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">Версия {contract.version}</span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Арендатор:{" "}
              <Link href={`/admin/tenants/${contract.tenant.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                {contract.tenant.companyName}
              </Link>
              {" · создан "}{fmtDate(contract.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            {contract.builderState ? (
              <SignedPdfButton contractId={contract.id} />
            ) : (
              <p className="max-w-[14rem] text-[11px] text-slate-400 dark:text-slate-500">PDF доступен для договоров из конструктора.</p>
            )}
            {landlordPayloadB64 && (
              <ContractEcpSign payloadB64={landlordPayloadB64} mode="landlord" contractId={contract.id} label="Подписать ЭЦП (арендодатель)" />
            )}
            {contract.status !== "SIGNED" && contract.status !== "REJECTED" && contract.status !== "ARCHIVED" && (
              <SendForSignatureButton contractId={contract.id} alreadySent={!!contract.sentAt} />
            )}
          </div>
        </div>
      </div>

      {/* Две колонки: контент слева, сводка + связи справа */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Таймлайн подписания */}
          <Section title="Подписание" icon={Clock}>
            <ol className="flex flex-wrap items-start gap-x-2 gap-y-4">
              {steps.map((s, i) => {
                const done = s.date !== null || s.label === "Создан"
                return (
                  <li key={s.label} className="flex items-center">
                    <div className="flex w-24 flex-col items-center text-center">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500"}`}>
                        {done ? "✓" : i + 1}
                      </span>
                      <span className={`mt-1.5 text-[11px] leading-tight ${done ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}`}>{s.label}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{s.date ? s.date.toLocaleDateString("ru-RU") : "—"}</span>
                      {s.hint && <span className="text-[10px] text-slate-400 dark:text-slate-500">{s.hint}</span>}
                    </div>
                    {i < steps.length - 1 && <span className="mx-1 hidden h-px w-4 bg-slate-200 dark:bg-slate-700 sm:block" />}
                  </li>
                )
              })}
            </ol>
            {contract.rejectedAt && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                Отклонён {contract.rejectedAt.toLocaleDateString("ru-RU")}{contract.rejectionReason ? ` · ${contract.rejectionReason}` : ""}
              </div>
            )}
          </Section>

          {/* Доп. соглашения — действия */}
          {contract.status === "SIGNED" && !isAddendum && (
            <Section title="Дополнительные соглашения" icon={ShieldCheck}>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Продлите срок или расторгните договор — ДС уйдёт арендатору на подпись.</p>
              <AddendumActions contractId={contract.id} />
            </Section>
          )}

          {/* Текст договора — сворачиваемый */}
          <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              Текст договора
              <ChevronDown className="ml-auto h-4 w-4 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <pre className="max-h-[600px] overflow-y-auto whitespace-pre-wrap border-t border-slate-100 px-5 py-4 font-sans text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:text-slate-300">
              {fullContractText || "(пусто)"}
            </pre>
          </details>
        </div>

        {/* Правая колонка */}
        <div className="space-y-4">
          <Section title="Сводка" icon={Calendar}>
            <dl className="space-y-2.5 text-sm">
              <Row label="Начало" value={fmtDate(contract.startDate)} />
              <Row label="Окончание" value={fmtDate(contract.endDate)} />
              {isAddendum && contract.effectiveDate && (
                <Row label="Вступает в силу" value={`${fmtDate(contract.effectiveDate)}${contract.appliedAt ? " ✓" : ""}`} />
              )}
              <Row label="Начислений" value={String(contract._count.charges)} icon={Receipt} />
              <Row label="Арендатор" value={contract.tenant.companyName} href={`/admin/tenants/${contract.tenant.id}`} icon={Users} />
            </dl>
          </Section>

          {(contract.parentContract || contract.parentVersion) && (
            <Section title="Связи" icon={Users}>
              {contract.parentContract && (
                <div className="text-sm">
                  <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Основной договор</p>
                  <Link href={`/admin/contracts/${contract.parentContract.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                    № {contract.parentContract.number} ({TYPE_LABELS[contract.parentContract.type] ?? contract.parentContract.type})
                  </Link>
                </div>
              )}
              {contract.parentVersion && (
                <div className="mt-3 text-sm">
                  <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Предыдущая версия</p>
                  <Link href={`/admin/contracts/${contract.parentVersion.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                    № {contract.parentVersion.number} (v{contract.parentVersion.version})
                  </Link>
                </div>
              )}
            </Section>
          )}

          {contract.versions.length > 0 && (
            <Section title={`Версии (${contract.versions.length})`} icon={HistoryIcon}>
              <ul className="space-y-2 text-sm">
                {contract.versions.map((v) => (
                  <li key={v.id}>
                    <Link href={`/admin/contracts/${v.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:border-blue-300 hover:bg-blue-50/30 dark:border-slate-800 dark:hover:bg-blue-500/10">
                      <span><span className="font-medium text-slate-900 dark:text-slate-100">v{v.version}</span><span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{fmtDate(v.createdAt)}</span></span>
                      <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_LABELS[v.status]?.color ?? "bg-slate-100"}`}>{STATUS_LABELS[v.status]?.label ?? v.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {contract.addenda.length > 0 && (
            <Section title={`Доп. соглашения (${contract.addenda.length})`} icon={ShieldCheck}>
              <ul className="space-y-2 text-sm">
                {contract.addenda.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/contracts/${a.id}`} className="flex flex-col gap-1 rounded-lg border border-slate-200 px-3 py-2 hover:border-blue-300 hover:bg-blue-50/30 dark:border-slate-800 dark:hover:bg-blue-500/10">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">ДС № {a.number}</span>
                        <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_LABELS[a.status]?.color ?? "bg-slate-100"}`}>{STATUS_LABELS[a.status]?.label ?? a.status}</span>
                      </div>
                      {a.changeKind && <span className="text-xs text-slate-500 dark:text-slate-400">{CHANGE_KIND_LABELS[a.changeKind] ?? a.changeKind}</span>}
                      <span className="text-xs text-slate-400 dark:text-slate-500">{fmtDate(a.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof FileText; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/50">
        <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Row({ label, value, href, icon: Icon }: { label: string; value: string; href?: string; icon?: typeof FileText }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </dt>
      <dd className="min-w-0 truncate text-right font-medium text-slate-900 dark:text-slate-100" title={value}>
        {href ? <Link href={href} className="text-blue-600 hover:underline dark:text-blue-400">{value}</Link> : value}
      </dd>
    </div>
  )
}
