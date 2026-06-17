// Форма «Данные компании» карточки арендатора. Вынесена из page.tsx, чтобы
// держать страницу тонкой (perf-gate: tenant detail = fast shell).
// Server component: inline server action updateTenant.

import { updateTenant } from "@/app/actions/tenant"
import { Button } from "@/components/ui/button"
import { KZ_VAT_RATE_OPTIONS } from "@/lib/kz-vat"
import { TenantPartyFields } from "./tenant-party-fields"
import { IndexationHint } from "./indexation-hint"
import { RentalPeriodCard } from "./rental-period-card"

export type CompanyFormTenant = {
  id: string
  companyName: string
  legalType: string
  bin: string | null
  iin: string | null
  category: string | null
  isVatPayer: boolean
  legalAddress: string | null
  actualAddress: string | null
  directorName: string | null
  directorPosition: string | null
  usePurpose: string | null
  basisDocument: string | null
  idDocNumber: string | null
  idDocIssuedBy: string | null
  idDocIssuedAt: Date | null
  idDocExpiresAt: Date | null
  contractEnd: Date | null
}

export function CompanyForm({
  tenant,
  canEditCompany,
  tenantVatRate,
  activeContract,
  ratePerSqm,
  monthlyRent,
}: {
  tenant: CompanyFormTenant
  canEditCompany: boolean
  tenantVatRate: number
  activeContract: { number: string | null; startDate: Date | null; endDate: Date | null } | null
  ratePerSqm: Parameters<typeof IndexationHint>[0]["initialRate"]
  monthlyRent: Parameters<typeof IndexationHint>[0]["monthlyRent"]
}) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server"
        await updateTenant(tenant.id, formData)
      }}
      className="p-5 grid grid-cols-2 gap-4"
    >
      {/* Эта форма НЕ редактирует bankName/iik/bik/cleaningFee/customRate/
          fixedMonthlyRent — они в других формах. Убраны вредные hidden-inputs
          (раньше затирали значения нулём/пустотой при сохранении).
          Sentinel «isVatPayerForm=1» сообщает action что НДС-чекбокс в этой
          форме — иначе несохранённая галка не превратится в false. */}
      <input type="hidden" name="isVatPayerForm" value="1" />

      <fieldset disabled={!canEditCompany} className="contents">
      {/* Поля стороны-арендатора (зависят от правовой формы; для физлица —
          ФИО/адрес проживания/удостоверение, без директора и основания). */}
      <TenantPartyFields
        tenant={{
          companyName: tenant.companyName,
          legalType: tenant.legalType,
          bin: tenant.bin,
          iin: tenant.iin,
          legalAddress: tenant.legalAddress,
          actualAddress: tenant.actualAddress,
          directorName: tenant.directorName,
          directorPosition: tenant.directorPosition,
          basisDocument: tenant.basisDocument,
          idDocNumber: tenant.idDocNumber,
          idDocIssuedBy: tenant.idDocIssuedBy,
          idDocIssuedAt: tenant.idDocIssuedAt?.toISOString().slice(0, 10) ?? null,
          idDocExpiresAt: tenant.idDocExpiresAt?.toISOString().slice(0, 10) ?? null,
        }}
      />
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Вид деятельности</label>
        <input
          name="category"
          defaultValue={tenant.category ?? ""}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
      <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
            <input
              name="isVatPayer"
              type="checkbox"
              defaultChecked={tenant.isVatPayer}
              className="mt-1 rounded border-slate-300"
            />
            <span>
              <span className="block font-medium text-slate-900 dark:text-slate-100">Арендатор — плательщик НДС</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                Для карточки контрагента, документов и будущего ЭСФ-контура.
              </span>
            </span>
          </label>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Ставка НДС арендатора</label>
            <select
              name="vatRate"
              defaultValue={String(tenantVatRate)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900"
            >
              {KZ_VAT_RATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Можно выбрать только ставки, предусмотренные НК РК: 0%, 5%, 10% или 16%.
            </p>
          </div>
        </div>
      </div>
      <div className="col-span-full">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Целевое использование помещения
        </label>
        <input
          name="usePurpose"
          defaultValue={tenant.usePurpose ?? ""}
          placeholder="например: офиса частного судебного исполнителя / розничной торговли / салона красоты"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          Подставится в п. 1.1 договора: «для использования в целях <span className="font-mono">размещения [текст]</span>». Если пусто — «по согласованному Сторонами назначению».
        </p>
      </div>
      {/* Период аренды — из активного Договора (вынесено в компонент). */}
      <RentalPeriodCard activeContract={activeContract} />
      <IndexationHint
        initialContractEnd={tenant.contractEnd?.toISOString().slice(0, 10) ?? null}
        initialRate={ratePerSqm}
        monthlyRent={monthlyRent}
      />
      <div className="col-span-2 flex justify-end">
        <Button
          type="submit"
          size="lg"
          disabled={!canEditCompany}
          className="font-medium"
        >
          Сохранить
        </Button>
      </div>
      </fieldset>
    </form>
  )
}
