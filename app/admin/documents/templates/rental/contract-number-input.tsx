"use client"

import { useState } from "react"
import { Hash, Check } from "lucide-react"

export function ContractNumberInput({
  initial,
  tenantId,
  suggestedNumber,
}: {
  initial: string
  tenantId: string
  suggestedNumber: string | null
}) {
  const [number, setNumber] = useState(initial)
  const isAuto = suggestedNumber && number === suggestedNumber

  const docxUrl = `/api/contracts/generate?tenantId=${tenantId}&number=${encodeURIComponent(number)}`

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 print:hidden mb-4 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3">
        <Hash className="h-4 w-4 text-slate-400 shrink-0" />
        <label className="text-sm font-medium text-slate-700 shrink-0">Номер договора:</label>
        <input
          type="text"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-mono focus:border-blue-500 focus:outline-none"
          placeholder="F16-2026-001"
        />
        {isAuto ? (
          <span className="text-xs text-emerald-600 flex items-center gap-1 shrink-0">
            <Check className="h-3 w-3" />
            Авто-номер
          </span>
        ) : suggestedNumber ? (
          <button
            onClick={() => setNumber(suggestedNumber)}
            className="text-xs text-blue-600 hover:underline shrink-0"
          >
            Использовать «{suggestedNumber}»
          </button>
        ) : null}
        <a
          href={docxUrl}
          download
          className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white shrink-0"
        >
          Скачать DOCX
        </a>
      </div>
      <p className="text-[11px] text-slate-400 mt-2 ml-7">
        Номер уникален в пределах здания. Можно ввести свой или использовать предложенный системой.
      </p>
    </div>
  )
}
