"use client"

import { useState } from "react"
import { ContractConstructor } from "@/components/contract-constructor/contract-constructor"
import { AddendumConstructor } from "@/components/contract-constructor/addendum-constructor"
import { AvrConstructor } from "@/components/contract-constructor/avr-constructor"
import { InvoiceConstructor } from "./invoice-constructor"
import { ReconciliationConstructor } from "./reconciliation-constructor"
import { useT } from "@/lib/i18n/client"

type CreateTab = "contract" | "addendum" | "avr" | "invoice" | "reconciliation"
// Вкладки хранят только ключ — подпись берётся из словаря при отрисовке.
const TABS = [
  { key: "contract", labelKey: "common.docs.createTabs.contract" },
  { key: "addendum", labelKey: "common.docs.createTabs.addendum" },
  { key: "avr", labelKey: "common.docs.createTabs.avr" },
  { key: "invoice", labelKey: "common.docs.createTabs.invoice" },
  { key: "reconciliation", labelKey: "common.docs.createTabs.reconciliation" },
] as const

function tabBtn(active: boolean): string {
  return `rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
  }`
}

/** Под-вкладки создания документа: конструкторы договора / АВР / счёта / акта сверки. */
export function DocumentCreate({
  initialTab = "contract",
  initialTenantId,
  initialDraftId,
}: {
  initialTab?: CreateTab
  initialTenantId?: string
  initialDraftId?: string
}) {
  const { t } = useT()
  const [tab, setTab] = useState<CreateTab>(initialTab)
  return (
    <div className="space-y-5">
      <div className="flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((item) => (
          <button key={item.key} onClick={() => setTab(item.key)} className={tabBtn(tab === item.key)}>{t(item.labelKey)}</button>
        ))}
      </div>
      {tab === "contract" && <ContractConstructor embedded initialTenantId={initialTenantId} initialDraftId={initialDraftId} />}
      {tab === "addendum" && <AddendumConstructor embedded initialTenantId={initialTenantId} />}
      {tab === "avr" && <AvrConstructor embedded initialTenantId={initialTenantId} />}
      {tab === "invoice" && <InvoiceConstructor embedded initialTenantId={initialTenantId} />}
      {tab === "reconciliation" && <ReconciliationConstructor embedded initialTenantId={initialTenantId} />}
    </div>
  )
}
