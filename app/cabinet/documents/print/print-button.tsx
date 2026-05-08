"use client"

import { Printer } from "lucide-react"

export function CabinetPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap"
    >
      <Printer className="h-4 w-4" />
      Печать / PDF
    </button>
  )
}
