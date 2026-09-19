import { ChevronDown, Plus } from "lucide-react"
import Link from "next/link"

const ITEMS = [
  { key: "contract", label: "Договор" },
  { key: "addendum", label: "Допсоглашение к договору" },
  { key: "invoice", label: "Счёт на оплату" },
  { key: "avr", label: "АВР (акт выполненных работ)" },
  { key: "reconciliation", label: "Акт сверки" },
]

// «Создать» — одной кнопкой со списком вместо отдельной вкладки и второго
// ряда вкладок. Каждый пункт открывает свой конструктор.
export function CreateDocumentMenu() {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 [&::-webkit-details-marker]:hidden">
        <Plus className="h-4 w-4" />
        Создать
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {ITEMS.map((it) => (
          <Link
            key={it.key}
            href={`/admin/documents?create=${it.key}`}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {it.label}
          </Link>
        ))}
      </div>
    </details>
  )
}
