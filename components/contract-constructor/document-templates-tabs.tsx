"use client"

import { useState, type ReactNode } from "react"
import { ContractConstructor } from "./contract-constructor"

/**
 * Вкладки страницы шаблонов документов:
 *  - «Конструктор договора» (новая система, ContractState → сборка → предпросмотр);
 *  - «Шаблоны: счёт / АВР / сверка» (старая загрузка DOCX/XLSX, передаётся как
 *    server-component через prop `legacy` — пока не мигрирована на конструктор).
 */
export function DocumentTemplatesTabs({ legacy }: { legacy: ReactNode }) {
  const [tab, setTab] = useState<"builder" | "legacy">("builder")
  return (
    <div className="p-4">
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("builder")}
          className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${tab === "builder" ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
        >
          Конструктор договора
        </button>
        <button
          onClick={() => setTab("legacy")}
          className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${tab === "legacy" ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
        >
          Шаблоны: счёт / АВР / сверка
        </button>
      </div>
      {tab === "builder" ? <ContractConstructor /> : <div>{legacy}</div>}
    </div>
  )
}
