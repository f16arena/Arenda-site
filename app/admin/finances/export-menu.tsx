import { Download, Upload } from "lucide-react"
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu"

// Выгрузки и импорт — одним меню вместо четырёх цветных кнопок в шапке.
export function ExportMenu({
  period,
  canZip,
  can1c,
  canExcel,
  canImport,
}: {
  period: string
  canZip: boolean
  can1c: boolean
  canExcel: boolean
  canImport: boolean
}) {
  const icon = <Download className="h-4 w-4 text-slate-400" />
  const items: ActionMenuItem[] = [
    ...(canZip ? [{ label: "Счета и АВР за месяц (ZIP)", icon, href: `/api/export/documents-zip?period=${period}`, download: true }] : []),
    ...(canExcel ? [{ label: "Все финансы в Excel", icon, href: "/api/export/finances", download: true }] : []),
    ...(can1c ? [{ label: "Для бухгалтерии (1С)", icon, href: "/api/export/1c", download: true }] : []),
    ...(canImport ? [{ label: "Загрузить выписку банка", icon: <Upload className="h-4 w-4 text-slate-400" />, href: "/admin/finances/import", separatorBefore: true }] : []),
  ]
  return <ActionMenu icon={<Download className="h-4 w-4" />} label="Выгрузить" items={items} />
}
