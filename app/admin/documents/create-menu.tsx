"use client"

import { Plus } from "lucide-react"
import { ActionMenu } from "@/components/ui/action-menu"
import { useT } from "@/lib/i18n/client"

const ITEMS = ["contract", "addendum", "invoice", "avr", "reconciliation"] as const

// «Создать» — одной кнопкой со списком вместо отдельной вкладки и второго
// ряда вкладок. Каждый пункт открывает свой конструктор.
export function CreateDocumentMenu() {
  const { t } = useT()
  return (
    <ActionMenu
      tone="primary"
      icon={<Plus className="h-4 w-4" />}
      label={t("adminDocs.create.label")}
      items={ITEMS.map((key) => ({
        label: t(`adminDocs.create.${key}`),
        href: `/admin/documents?create=${key}`,
      }))}
    />
  )
}
