"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, ClipboardList, FileText, Receipt } from "lucide-react"

import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { CHARGE_TYPES, formatDate, formatMoney } from "@/lib/utils"
import {
  DocumentsChecklistLoader,
  EmailLogLoader,
  FullFloorAssignLoader,
  ServiceChargesFormLoader,
} from "./client-section-loaders"
import { ContractWorkflowActions } from "./contract-actions"

type ServiceCharge = {
  id: string
  type: string
  amount: number
  description: string | null
}

type TenantDocument = {
  id: string
  type: string
  name: string
  fileUrl: string | null
  storageFileId?: string | null
  createdAt: string
}

type EmailLogItem = {
  id: string
  recipient: string
  subject: string
  type: string
  status: string
  externalId: string | null
  error: string | null
  openedAt: string | null
  openCount: number
  sentAt: string
}

type HistoryItem = {
  id: string
  action: string
  entity: string
  userName: string | null
  userRole: string | null
  createdAt: string
}

type FloorItem = {
  id: string
  name: string
  totalArea: number | null
  ratePerSqm: number
  fullFloorTenantId: string | null
  fixedMonthlyRent: number | null
}

type CurrentFloor = {
  id: string
  name: string
  fixedMonthlyRent: number | null
}

type ContractItem = {
  id: string
  number: string
  type: string
  status: string
  changeKind: string | null
  appliedAt: string | null
  startDate: string | null
  endDate: string | null
  signedByTenantAt: string | null
  signedByLandlordAt: string | null
  signToken: string | null
}

type ChargeItem = {
  id: string
  period: string
  type: string
  amount: number
  isPaid: boolean
}

type LazyPayload = {
  serviceCharges: ServiceCharge[]
  documents: TenantDocument[]
  emailLogs: EmailLogItem[]
  history: HistoryItem[]
  fullFloors: {
    floors: FloorItem[]
    currentFloors: CurrentFloor[]
  }
  contracts: {
    items: ContractItem[]
    total: number
  }
  recentCharges: {
    items: ChargeItem[]
    total: number
  }
}

type LazyState =
  | { loading: true; error: null; data: null }
  | { loading: false; error: string; data: null }
  | { loading: false; error: null; data: LazyPayload }

const TenantLazyContext = createContext<{
  tenantId: string
  legalType: string
  period: string
  defaultDueDate: string
  canSignDocuments: boolean
  state: LazyState
} | null>(null)

export function TenantLazySectionsProvider({
  tenantId,
  legalType,
  period,
  defaultDueDate,
  canSignDocuments,
  children,
}: {
  tenantId: string
  legalType: string
  period: string
  defaultDueDate: string
  canSignDocuments: boolean
  children: ReactNode
}) {
  const [state, setState] = useState<LazyState>({ loading: true, error: null, data: null })

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ period })

    fetch(`/api/admin/tenants/${tenantId}/sections?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить дополнительные данные арендатора")
        return response.json()
      })
      .then((data: LazyPayload) => {
        setState({ loading: false, error: null, data })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Не удалось загрузить дополнительные данные арендатора",
          data: null,
        })
      })

    return () => controller.abort()
  }, [period, tenantId])

  const value = useMemo(
    () => ({ tenantId, legalType, period, defaultDueDate, canSignDocuments, state }),
    [canSignDocuments, defaultDueDate, legalType, period, state, tenantId],
  )

  return (
    <TenantLazyContext.Provider value={value}>
      {children}
    </TenantLazyContext.Provider>
  )
}

export function TenantLazyServiceCharges() {
  const ctx = useTenantLazyContext()
  if (ctx.state.loading) return <LazySkeleton />
  if (ctx.state.error) return <LazyError message={ctx.state.error} />
  const { data } = ctx.state
  if (!data) return <LazyError message="Данные арендатора не загрузились" />

  return (
    <ServiceChargesFormLoader
      tenantId={ctx.tenantId}
      period={ctx.period}
      defaultDueDate={ctx.defaultDueDate}
      existingCharges={data.serviceCharges}
    />
  )
}

export function TenantLazyEmailLog() {
  const ctx = useTenantLazyContext()
  if (ctx.state.loading) return <LazySkeleton />
  if (ctx.state.error) return <LazyError message={ctx.state.error} />
  const { data } = ctx.state
  if (!data) return <LazyError message="Данные арендатора не загрузились" />
  if (data.emailLogs.length === 0) return null

  return <EmailLogLoader items={data.emailLogs} />
}

export function TenantLazyDocumentsChecklist() {
  const ctx = useTenantLazyContext()
  if (ctx.state.loading) return <LazySkeleton />
  if (ctx.state.error) return <LazyError message={ctx.state.error} />
  const { data } = ctx.state
  if (!data) return <LazyError message="Данные арендатора не загрузились" />

  return (
    <DocumentsChecklistLoader
      tenantId={ctx.tenantId}
      legalType={ctx.legalType}
      documents={data.documents}
    />
  )
}

export function TenantLazyHistory() {
  const ctx = useTenantLazyContext()
  if (ctx.state.loading) return <LazySkeleton />
  if (ctx.state.error) return <LazyError message={ctx.state.error} />
  const { data } = ctx.state
  if (!data) return <LazyError message="Данные арендатора не загрузились" />

  return <TenantHistoryClient items={data.history} />
}

export function TenantLazyFullFloor() {
  const ctx = useTenantLazyContext()
  if (ctx.state.loading) return <LazySkeleton />
  if (ctx.state.error) return <LazyError message={ctx.state.error} />
  const { data } = ctx.state
  if (!data) return <LazyError message="Данные арендатора не загрузились" />

  return (
    <FullFloorAssignLoader
      tenantId={ctx.tenantId}
      floors={data.fullFloors.floors}
      currentFloors={data.fullFloors.currentFloors}
    />
  )
}

export function TenantLazyContractsSidebar() {
  const ctx = useTenantLazyContext()
  if (ctx.state.loading) return <LazySkeleton />
  if (ctx.state.error) return <LazyError message={ctx.state.error} />
  const { data } = ctx.state
  if (!data) return <LazyError message="Данные арендатора не загрузились" />

  return (
    <TenantContractsSidebarClient
      items={data.contracts.items}
      total={data.contracts.total}
      canSign={ctx.canSignDocuments}
    />
  )
}

export function TenantLazyRecentChargesSidebar() {
  const ctx = useTenantLazyContext()
  if (ctx.state.loading) return <LazySkeleton />
  if (ctx.state.error) return <LazyError message={ctx.state.error} />
  const { data } = ctx.state
  if (!data) return <LazyError message="Данные арендатора не загрузились" />

  return <TenantRecentChargesSidebarClient items={data.recentCharges.items} total={data.recentCharges.total} />
}

function useTenantLazyContext() {
  const ctx = useContext(TenantLazyContext)
  if (!ctx) throw new Error("TenantLazySectionsProvider is missing")
  return ctx
}

function LazySkeleton() {
  return (
    <div className="p-5">
      <div className="h-4 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mt-4 space-y-2">
        <div className="h-9 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
        <div className="h-9 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
      </div>
    </div>
  )
}

function LazyError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  )
}

function TenantContractsSidebarClient({ items, total, canSign }: { items: ContractItem[]; total: number; canSign: boolean }) {
  return (
    <CollapsibleCard title="Договоры" icon={FileText} meta={`${total} шт.`}>
      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {items.map((contract) => {
          const statusLabels: Record<string, { label: string; cls: string }> = {
            DRAFT: { label: "Черновик", cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" },
            SENT: { label: "Отправлен", cls: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300" },
            VIEWED: { label: "Открыт арендатором", cls: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300" },
            SIGNED_BY_TENANT: { label: "Ждет нашей подписи", cls: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300" },
            SIGNED: { label: "Подписан", cls: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" },
            REJECTED: { label: "Отклонен", cls: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300" },
          }
          const status = statusLabels[contract.status] ?? {
            label: contract.status,
            cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
          }
          const docLabel = contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор"

          return (
            <div key={contract.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {docLabel} № {contract.number}
                </p>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.cls}`}>
                  {status.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                {contract.startDate ? formatDate(contract.startDate) : "—"} → {contract.endDate ? formatDate(contract.endDate) : "—"}
              </p>
              {contract.type === "ADDENDUM" && (
                <p className={`mt-1 text-[11px] ${
                  contract.status === "SIGNED" && contract.appliedAt
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-300"
                }`}>
                  {contract.status === "SIGNED"
                    ? contract.appliedAt
                      ? "Применено к условиям аренды"
                      : "Подписано, ожидает применения"
                    : "Изменения вступят только после подписи"}
                </p>
              )}
              {canSign && (
                <div className="mt-2">
                  <ContractWorkflowActions contract={contract} />
                </div>
              )}
            </div>
          )
        })}
        {items.length === 0 && (
          <p className="px-4 py-4 text-center text-xs text-slate-400 dark:text-slate-500">Нет договоров</p>
        )}
      </div>
    </CollapsibleCard>
  )
}

function TenantRecentChargesSidebarClient({ items, total }: { items: ChargeItem[]; total: number }) {
  return (
    <CollapsibleCard title="Последние начисления" icon={Receipt} meta={`${total} записей`}>
      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {items.map((charge) => (
          <div key={charge.id} className="flex items-center justify-between px-4 py-2.5">
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {CHARGE_TYPES[charge.type] ?? charge.type}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{charge.period}</p>
            </div>
            <div className="text-right">
              <p className={`text-xs font-semibold ${charge.isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {formatMoney(charge.amount)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                {charge.isPaid ? "Оплачено" : "Долг"}
              </p>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="px-4 py-4 text-center text-xs text-slate-400 dark:text-slate-500">Начислений нет</p>
        )}
      </div>
    </CollapsibleCard>
  )
}

function TenantHistoryClient({ items }: { items: HistoryItem[] }) {
  if (items.length === 0) return null

  const actionLabels: Record<string, string> = {
    CREATE: "Создание",
    UPDATE: "Изменение",
    DELETE: "Удаление",
    LOGIN: "Вход",
    LOGOUT: "Выход",
  }
  const entityLabels: Record<string, string> = {
    tenant: "арендатор",
    charge: "начисление",
    payment: "платеж",
    contract: "договор",
    request: "заявка",
    user: "пользователь",
  }

  return (
    <CollapsibleCard
      title="История изменений"
      icon={ClipboardList}
      meta={`${items.length} событий`}
    >
      <ul className="max-h-96 divide-y divide-slate-50 overflow-y-auto dark:divide-slate-800">
        {items.map((log) => (
          <li key={log.id} className="px-5 py-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-700 dark:text-slate-300">
                <b>{actionLabels[log.action] ?? log.action}</b>{" "}
                {entityLabels[log.entity] ?? log.entity}
              </span>
              <span className="whitespace-nowrap text-slate-400 dark:text-slate-500">
                {new Date(log.createdAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {log.userName && (
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                {log.userName} · {log.userRole}
              </p>
            )}
          </li>
        ))}
      </ul>
    </CollapsibleCard>
  )
}
