"use client"

import { useRouter } from "next/navigation"
import { Printer } from "lucide-react"

type TenantOption = {
  id: string
  companyName: string
  userName: string
  spaceNumber?: string
}

export function TenantSelector({
  tenants,
  selectedId,
}: {
  tenants: TenantOption[]
  selectedId?: string
}) {
  const router = useRouter()

  return (
    <form>
      <select
        name="tenantId"
        value={selectedId ?? ""}
        onChange={(e) => {
          const val = e.target.value
          router.push(val ? `?tenantId=${val}` : "?")
        }}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900"
      >
        <option value="">— Пустой шаблон —</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.companyName} · {t.userName}
            {t.spaceNumber ? ` · Каб. ${t.spaceNumber}` : ""}
          </option>
        ))}
      </select>
    </form>
  )
}

export function PrintButton() {
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
