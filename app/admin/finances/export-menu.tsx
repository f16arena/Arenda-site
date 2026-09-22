import { Download, Upload } from "lucide-react"
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu"
import { getT } from "@/lib/i18n/server"

// Выгрузки и импорт — одним меню вместо четырёх цветных кнопок в шапке.
export async function ExportMenu({
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
  const { t } = await getT()
  const icon = <Download className="h-4 w-4 text-slate-400" />
  const items: ActionMenuItem[] = [
    ...(canZip ? [{ label: t("adminFinance.exportMenu.zip"), icon, href: `/api/export/documents-zip?period=${period}`, download: true }] : []),
    ...(canExcel ? [{ label: t("adminFinance.exportMenu.excel"), icon, href: "/api/export/finances", download: true }] : []),
    ...(can1c ? [{ label: t("adminFinance.exportMenu.oneC"), icon, href: "/api/export/1c", download: true }] : []),
    ...(canImport ? [{ label: t("adminFinance.exportMenu.bankImport"), icon: <Upload className="h-4 w-4 text-slate-400" />, href: "/admin/finances/import", separatorBefore: true }] : []),
  ]
  return <ActionMenu icon={<Download className="h-4 w-4" />} label={t("adminFinance.exportMenu.label")} items={items} />
}
