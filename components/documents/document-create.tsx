"use client"

import { useState } from "react"
import { ContractConstructor } from "@/components/contract-constructor/contract-constructor"
import { AvrConstructor } from "@/components/contract-constructor/avr-constructor"
import { InvoiceConstructor } from "./invoice-constructor"
import { DocumentQuickGen } from "./document-quick-gen"
import type { DocumentTenantOption } from "@/lib/document-tenants"

type CreateTab = "contract" | "avr" | "invoice" | "reconciliation"
const TABS: { key: CreateTab; label: string }[] = [
  { key: "contract", label: "Договор" },
  { key: "avr", label: "АВР" },
  { key: "invoice", label: "Счёт на оплату" },
  { key: "reconciliation", label: "Акт сверки" },
]

function tabBtn(active: boolean): string {
  return `rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
  }`
}

/** Под-вкладки создания документа: конструкторы договора/АВР + быстрая генерация счёта/сверки. */
export function DocumentCreate({
  tenants,
  initialTab = "contract",
  initialTenantId,
}: {
  tenants: DocumentTenantOption[]
  initialTab?: CreateTab
  initialTenantId?: string
}) {
  const [tab, setTab] = useState<CreateTab>(initialTab)
  return (
    <div className="space-y-5">
      <div className="flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={tabBtn(tab === t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === "contract" && <ContractConstructor embedded initialTenantId={initialTenantId} />}
      {tab === "avr" && <AvrConstructor embedded initialTenantId={initialTenantId} />}
      {tab === "invoice" && <InvoiceConstructor embedded initialTenantId={initialTenantId} />}
      {tab === "reconciliation" && <DocumentQuickGen kind="reconciliation" tenants={tenants} initialTenantId={initialTenantId} />}
    </div>
  )
}
