import { Landmark } from "lucide-react"
import { updateOrganizationRequisites } from "@/app/actions/organization-settings"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { AsciiEmailInput, KzPhoneInput } from "@/components/forms/contact-inputs"
import { OrganizationIdentityFields } from "@/components/settings/organization-identity-fields"
import { ServerForm } from "@/components/ui/server-form"

type OrganizationRequisitesFormData = {
  id: string
  name: string
  legalType: string | null
  legalName: string | null
  shortName: string | null
  bin: string | null
  iin: string | null
  directorName: string | null
  directorPosition: string | null
  basis: string | null
  legalAddress: string | null
  actualAddress: string | null
  bankName: string | null
  iik: string | null
  bik: string | null
  secondBankName: string | null
  secondIik: string | null
  secondBik: string | null
  phone: string | null
  email: string | null
}

export function OrganizationRequisitesSection({ organization }: { organization: OrganizationRequisitesFormData }) {
  const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
  const labelClass = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/50">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Реквизиты арендодателя</h2>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Подставляются в договоры, счета и экран оплаты
        </span>
      </div>

      <ServerForm
        action={updateOrganizationRequisites.bind(null, organization.id)}
        successMessage="Реквизиты организации сохранены"
        className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2"
      >
        <div className="lg:col-span-2 rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
          Здесь заполняются данные арендодателя как юридического лица. Личный профиль пользователя находится отдельно в разделе
          {" "}
          <a href="/admin/profile" className="font-medium underline">Мой профиль</a>
          {" "}
          и не используется как реквизиты договора.
        </div>

        <OrganizationIdentityFields
          legalType={organization.legalType}
          bin={organization.bin}
          iin={organization.iin}
          inputClass={inputClass}
          labelClass={labelClass}
        />

        <div>
          <label className={labelClass}>Краткое название</label>
          <input
            name="shortName"
            defaultValue={organization.shortName ?? organization.name}
            className={inputClass}
            placeholder="ИП Иванов И.И."
          />
        </div>

        <div className="lg:col-span-2">
          <label className={labelClass}>Полное название арендодателя *</label>
          <input
            name="legalName"
            defaultValue={organization.legalName ?? organization.name}
            required
            className={inputClass}
            placeholder="ТОО «Название» или ИП ФИО"
          />
        </div>

        <div>
          <label className={labelClass}>ФИО руководителя *</label>
          <input
            name="directorName"
            defaultValue={organization.directorName ?? ""}
            required
            className={inputClass}
            placeholder="Иванов Иван Иванович"
          />
        </div>
        <div>
          <label className={labelClass}>Должность руководителя</label>
          <input
            name="directorPosition"
            defaultValue={organization.directorPosition ?? ""}
            className={inputClass}
            placeholder="Директор"
          />
        </div>

        <div className="lg:col-span-2">
          <label className={labelClass}>На основании чего действует *</label>
          <input
            name="basis"
            defaultValue={organization.basis ?? ""}
            required
            className={inputClass}
            placeholder="Устав, приказ, уведомление о начале деятельности..."
          />
        </div>

        <div>
          <label className={labelClass}>Юридический адрес *</label>
          <AddressAutocompleteInput
            name="legalAddress"
            defaultValue={organization.legalAddress ?? ""}
            required
            includeStructuredFields={false}
            className={inputClass}
            placeholder="РК, город, улица, дом, офис"
          />
        </div>
        <div>
          <label className={labelClass}>Фактический адрес</label>
          <AddressAutocompleteInput
            name="actualAddress"
            defaultValue={organization.actualAddress ?? ""}
            includeStructuredFields={false}
            className={inputClass}
            placeholder="Если отличается от юридического"
          />
        </div>

        <div id="payment-accounts" className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 lg:col-span-2">
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Платёжные счета</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Основной счёт подставляется в документы и оплату. Дополнительный счёт будет показан арендатору как второй вариант оплаты.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Основной счёт</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  В договорах и оплате
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div>
                  <label className={labelClass}>Название банка</label>
                  <input name="bankName" defaultValue={organization.bankName ?? ""} className={inputClass} placeholder="АО «Kaspi Bank»" />
                </div>
                <div>
                  <label className={labelClass}>БИК</label>
                  <input name="bik" defaultValue={organization.bik ?? ""} className={inputClass} placeholder="CASPKZKA" />
                </div>
                <div>
                  <label className={labelClass}>ИИК / расчётный счёт</label>
                  <input name="iik" defaultValue={organization.iik ?? ""} className={inputClass} placeholder="KZ..." />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Дополнительный счёт</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Необязательно
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div>
                  <label className={labelClass}>Название банка 2</label>
                  <input name="secondBankName" defaultValue={organization.secondBankName ?? ""} className={inputClass} placeholder="АО «Halyk Bank»" />
                </div>
                <div>
                  <label className={labelClass}>БИК 2</label>
                  <input name="secondBik" defaultValue={organization.secondBik ?? ""} className={inputClass} placeholder="HSBKKZKX" />
                </div>
                <div>
                  <label className={labelClass}>ИИК / расчётный счёт 2</label>
                  <input name="secondIik" defaultValue={organization.secondIik ?? ""} className={inputClass} placeholder="KZ..." />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>Телефон владельца</label>
          <KzPhoneInput name="phone" defaultValue={organization.phone ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Email владельца</label>
          <AsciiEmailInput name="email" defaultValue={organization.email ?? ""} className={inputClass} />
        </div>

        <div className="flex items-end justify-end lg:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            Сохранить реквизиты
          </button>
        </div>
      </ServerForm>
    </div>
  )
}
