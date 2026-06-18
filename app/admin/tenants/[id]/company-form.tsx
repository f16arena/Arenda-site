// Форма «Данные компании» карточки арендатора. Вынесена из page.tsx, чтобы
// держать страницу тонкой (perf-gate: tenant detail = fast shell).
// Server component: inline server action updateTenant.

import { updateTenant } from "@/app/actions/tenant"
import { Button } from "@/components/ui/button"
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
  vatStatus: string | null
  esfEnabled: boolean
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
          fixedMonthlyRent — они в других формах. НДС определяется автоматически
          из КГД внутри TenantPartyFields (там же hidden-поля + sentinel
          isVatPayerForm), ручного чекбокса/ставки больше нет. */}

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
          isVatPayer: tenant.isVatPayer,
          vatStatus: tenant.vatStatus,
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
        {/* Признак выставления ЭСФ (счёт-фактуры в КГД). Физлицам обычно выкл.
            НДС-статус — автоматический, показан выше в блоке реквизитов (из КГД). */}
        <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
          <input
            name="esfEnabled"
            type="checkbox"
            defaultChecked={tenant.esfEnabled}
            className="mt-1 rounded border-slate-300"
          />
          <span>
            <span className="block font-medium text-slate-900 dark:text-slate-100">Выставлять ЭСФ в КГД</span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              Если выключено — у счетов этого арендатора не будет кнопки «В ЭСФ». Физлицам обычно не выставляется.
            </span>
          </span>
        </label>
      </div>
      <input type="hidden" name="esfForm" value="1" />
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
