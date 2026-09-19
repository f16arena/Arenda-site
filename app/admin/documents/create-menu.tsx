import { Plus } from "lucide-react"
import { ActionMenu } from "@/components/ui/action-menu"

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
    <ActionMenu
      tone="primary"
      icon={<Plus className="h-4 w-4" />}
      label="Создать"
      items={ITEMS.map((it) => ({ label: it.label, href: `/admin/documents?create=${it.key}` }))}
    />
  )
}
