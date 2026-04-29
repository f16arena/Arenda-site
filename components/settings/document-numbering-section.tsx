import { Hash } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { setDocumentPrefix } from "@/app/actions/contracts"
import {
  DOC_KIND_LABEL,
  effectivePrefix,
  type DocumentKind,
} from "@/lib/document-numbering"

interface BuildingPrefixes {
  id: string
  name: string
  contractPrefix: string | null
  invoicePrefix: string | null
  actPrefix: string | null
  reconciliationPrefix: string | null
  contractCounter: number
  invoiceCounter: number
  actCounter: number
  reconciliationCounter: number
}

const KINDS: DocumentKind[] = ["contract", "invoice", "act", "reconciliation"]

const FIELD_BY_KIND: Record<DocumentKind, keyof BuildingPrefixes> = {
  contract: "contractPrefix",
  invoice: "invoicePrefix",
  act: "actPrefix",
  reconciliation: "reconciliationPrefix",
}

const COUNTER_BY_KIND: Record<DocumentKind, keyof BuildingPrefixes> = {
  contract: "contractCounter",
  invoice: "invoiceCounter",
  act: "actCounter",
  reconciliation: "reconciliationCounter",
}

export function DocumentNumberingSection({ building }: { building: BuildingPrefixes }) {
  const year = new Date().getFullYear()

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <Hash className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900">Нумерация документов</h2>
      </div>
      <div className="px-5 py-4 text-xs text-slate-500 border-b border-slate-50">
        Префикс — это короткое обозначение здания (например, F16). Система добавляет к нему тип документа,
        год и порядковый номер. Если оставить поле пустым, префикс сгенерируется автоматически из названия здания.
      </div>
      <div className="divide-y divide-slate-50">
        {KINDS.map((kind) => {
          const userPrefix = building[FIELD_BY_KIND[kind]] as string | null
          const counter = building[COUNTER_BY_KIND[kind]] as number
          const eff = effectivePrefix(building, kind)
          const nextSeq = kind === "contract" ? Math.max(counter, 0) + 1 : counter + 1
          const preview = `${eff}-${year}-${String(nextSeq).padStart(3, "0")}`

          return (
            <ServerForm
              key={kind}
              action={setDocumentPrefix.bind(null, building.id, kind)}
              successMessage={`Префикс «${DOC_KIND_LABEL[kind]}» сохранён`}
              className="px-5 py-4 grid grid-cols-[1.2fr_1fr_1.2fr_auto] gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  {DOC_KIND_LABEL[kind]}
                </label>
                <p className="text-xs text-slate-400">Тип документа</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Префикс</label>
                <input
                  name="prefix"
                  defaultValue={userPrefix ?? ""}
                  placeholder={eff}
                  maxLength={10}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono uppercase focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Следующий номер</label>
                <p className="px-3 py-2 text-sm font-mono bg-slate-50 rounded-lg border border-slate-200 text-slate-700">
                  {preview}
                </p>
              </div>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
              >
                Сохранить
              </button>
            </ServerForm>
          )
        })}
      </div>
    </div>
  )
}
