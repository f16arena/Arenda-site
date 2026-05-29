"use client"

import { useState, type ReactNode } from "react"
import { ContractConstructor } from "./contract-constructor"
import { AvrConstructor } from "./avr-constructor"

function tabBtn(active: boolean): string {
  return `rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
  }`
}

/**
 * Переключатель страницы шаблонов документов:
 *  - «Конструктор договора» (ContractState → сборка → предпросмотр);
 *  - «Шаблоны: счёт / АВР / сверка» (старая загрузка DOCX/XLSX, server-component
 *    через prop `legacy` — ещё не мигрирована на конструктор).
 */
export function DocumentTemplatesTabs({ legacy }: { legacy: ReactNode }) {
  const [tab, setTab] = useState<"builder" | "avr" | "legacy">("builder")
  return (
    <div className="space-y-5">
      <div className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        <button onClick={() => setTab("builder")} className={tabBtn(tab === "builder")}>Конструктор договора</button>
        <button onClick={() => setTab("avr")} className={tabBtn(tab === "avr")}>Конструктор АВР</button>
        <button onClick={() => setTab("legacy")} className={tabBtn(tab === "legacy")}>Шаблоны: счёт / АВР / сверка</button>
      </div>
      {tab === "builder" ? <ContractConstructor /> : tab === "avr" ? <AvrConstructor /> : <div>{legacy}</div>}
    </div>
  )
}
