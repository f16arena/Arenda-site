import Link from "next/link"
import type { ElementType } from "react"
import {
  ArrowLeft,
  ClipboardCheck,
  FileCheck,
  FileText,
  Package as PackageIcon,
  Receipt,
} from "lucide-react"
import { getActiveTemplate, getActiveContractTemplates } from "@/app/actions/document-templates"
import { CustomTemplateBlock } from "@/components/documents/custom-template-block"
import { requireOrgAccess } from "@/lib/org"
import { availableContractTypesForOrg } from "@/lib/contract-types-availability"
import { CONTRACT_PLACEMENT_TYPES } from "@/lib/contract-placement-types"

interface TypeMeta {
  type: "CONTRACT" | "INVOICE" | "ACT" | "RECONCILIATION"
  label: string
  description: string
  icon: ElementType
  createHref: string
  color: string
}

const TYPES: TypeMeta[] = [
  {
    type: "CONTRACT",
    label: "Договор аренды",
    description: "Основной договор аренды нежилого помещения.",
    icon: FileCheck,
    createHref: "/admin/documents/new/contract",
    color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    type: "INVOICE",
    label: "Счёт на оплату",
    description: "Ежемесячный счёт для арендатора.",
    icon: Receipt,
    createHref: "/admin/documents/new/invoice",
    color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    type: "ACT",
    label: "АВР / акт выполненных работ",
    description: "Акт за оказанные услуги аренды за период.",
    icon: ClipboardCheck,
    createHref: "/admin/documents/new/act",
    color: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    type: "RECONCILIATION",
    label: "Акт сверки",
    description: "Сверка взаиморасчётов с арендатором.",
    icon: FileText,
    createHref: "/admin/documents/new/reconciliation",
    color: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
]

export async function DocumentTemplateSettings() {
  const { orgId } = await requireOrgAccess()
  const activeTemplates = await Promise.all(
    TYPES.map((t) =>
      getActiveTemplate(t.type)
        .then((tpl) => ({ type: t.type, tpl }))
        .catch(() => ({ type: t.type, tpl: null }))
    )
  )

  const activeMap = new Map(activeTemplates.map((x) => [x.type, x.tpl]))

  // Договор: шаблоны по предмету аренды (помещение/крыша/территория/…).
  // Показываем только типы, реально доступные организации («умная видимость»).
  const [contractTypeKeys, contractTpls] = await Promise.all([
    availableContractTypesForOrg(orgId).catch(() => ["PREMISES"] as string[]),
    getActiveContractTemplates().catch(() => ({} as Record<string, { id: string; format: string; fileName: string; fileSize: number; uploadedAt: Date }>)),
  ])
  const contractTypeDefs = CONTRACT_PLACEMENT_TYPES.filter((t) => contractTypeKeys.includes(t.key))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/settings"
          className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          aria-label="Назад к настройкам"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <PackageIcon className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            Шаблоны документов
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            DOCX/XLSX-шаблоны для автоматического формирования документов
          </p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4 text-sm text-blue-900 dark:text-blue-200">
        <p className="font-medium mb-1">Placeholder-метки</p>
        <p className="text-blue-800 dark:text-blue-300">
          Вставляйте в DOCX/XLSX метки вида{" "}
          <code className="font-mono bg-blue-100 dark:bg-blue-500/20 px-1 rounded">{"{tenant_name}"}</code>,{" "}
          <code className="font-mono bg-blue-100 dark:bg-blue-500/20 px-1 rounded">{"{monthly_rent_with_words}"}</code>,{" "}
          <code className="font-mono bg-blue-100 dark:bg-blue-500/20 px-1 rounded">{"{period}"}</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {TYPES.map((meta) => {
          const Icon = meta.icon
          const active = activeMap.get(meta.type)
          return (
            <div
              key={meta.type}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta.color} shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{meta.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{meta.description}</p>
                </div>
              </div>
              <div className="p-5">
                {meta.type === "CONTRACT" ? (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Свой шаблон под каждый предмет аренды. Если для типа шаблон не загружен — используется
                      «общий», а если и его нет — встроенный шаблон системы.
                    </p>
                    <CustomTemplateBlock
                      documentType="CONTRACT"
                      title="Общий шаблон договора"
                      active={(contractTpls[""] as typeof active) ?? null}
                    />
                    {contractTypeDefs.map((t) => (
                      <CustomTemplateBlock
                        key={t.key}
                        documentType="CONTRACT"
                        placementType={t.key}
                        title={`Договор: ${t.short}`}
                        active={(contractTpls[t.key] as typeof active) ?? null}
                      />
                    ))}
                  </div>
                ) : (
                  <CustomTemplateBlock documentType={meta.type} active={active ?? null} />
                )}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Link
                    href={meta.createHref}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    Создать {meta.label.toLowerCase()} →
                  </Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
