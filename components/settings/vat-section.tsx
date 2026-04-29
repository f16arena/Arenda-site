import { Receipt } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { updateOrganizationVat } from "@/app/actions/organization-settings"

interface Props {
  organization: {
    id: string
    isVatPayer: boolean
    vatRate: number
    vatNumber: string | null
  }
}

export function VatSection({ organization }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <Receipt className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900">НДС</h2>
      </div>
      <ServerForm
        action={updateOrganizationVat.bind(null, organization.id)}
        successMessage="Настройки НДС сохранены"
        className="p-5 space-y-4"
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="isVatPayer"
            defaultChecked={organization.isVatPayer}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">Организация — плательщик НДС</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Если включено, НДС будет добавляться к суммам в счетах на оплату и актах
              оказанных услуг. Также включает поддержку ЭСФ (когда будет интегрирована).
            </p>
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Ставка НДС, %</label>
            <input
              name="vatRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={organization.vatRate}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">Стандарт РК — 12%</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Серия по НДС</label>
            <input
              name="vatNumber"
              defaultValue={organization.vatNumber ?? ""}
              placeholder="60001 17 0000 ..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">Из свидетельства о постановке на учёт по НДС</p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Сохранить
          </button>
        </div>

        <div className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <b className="text-amber-800">Важно про РК:</b> с 2019 года плательщики НДС обязаны выписывать{" "}
          <b>электронные счёт-фактуры (ЭСФ)</b> через государственный портал{" "}
          <a href="https://esf.gov.kz/" target="_blank" rel="noopener" className="underline text-amber-700">esf.gov.kz</a>.
          Бумажные счёт-фактуры (для НДС-учёта) не используются. Текущая система формирует только{" "}
          <i>счёт на оплату</i> и <i>акт оказанных услуг</i> — это самостоятельные документы, не заменяющие ЭСФ.
        </div>
      </ServerForm>
    </div>
  )
}
