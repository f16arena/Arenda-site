import { Landmark } from "lucide-react"
import { updateOrganizationRequisites } from "@/app/actions/organization-settings"
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
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Мои реквизиты</h2>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">Подставляются в документы и оплату</span>
      </div>

      <ServerForm
        action={updateOrganizationRequisites.bind(null, organization.id)}
        successMessage="Реквизиты организации сохранены"
        className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2"
      >
        <div>
          <label className={labelClass}>Правовая форма</label>
          <select name="legalType" defaultValue={organization.legalType ?? "IP"} className={inputClass}>
            <option value="IP">ИП</option>
            <option value="TOO">ТОО</option>
            <option value="AO">АО</option>
            <option value="PHYSICAL">Физическое лицо</option>
            <option value="OTHER">Другое</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Краткое название</label>
          <input name="shortName" defaultValue={organization.shortName ?? organization.name} className={inputClass} placeholder="ИП Иванов И.И." />
        </div>

        <div className="lg:col-span-2">
          <label className={labelClass}>Полное название арендодателя *</label>
          <input name="legalName" defaultValue={organization.legalName ?? organization.name} required className={inputClass} placeholder="ТОО «Название» или ИП ФИО" />
        </div>

        <div>
          <label className={labelClass}>БИН (для ТОО/АО)</label>
          <input name="bin" defaultValue={organization.bin ?? ""} inputMode="numeric" maxLength={12} className={inputClass} placeholder="12 цифр" />
        </div>
        <div>
          <label className={labelClass}>ИИН (для ИП/физлица)</label>
          <input name="iin" defaultValue={organization.iin ?? ""} inputMode="numeric" maxLength={12} className={inputClass} placeholder="12 цифр" />
        </div>

        <div>
          <label className={labelClass}>ФИО руководителя *</label>
          <input name="directorName" defaultValue={organization.directorName ?? ""} required className={inputClass} placeholder="Иванов Иван Иванович" />
        </div>
        <div>
          <label className={labelClass}>Должность руководителя</label>
          <input name="directorPosition" defaultValue={organization.directorPosition ?? ""} className={inputClass} placeholder="Директор" />
        </div>

        <div className="lg:col-span-2">
          <label className={labelClass}>На основании чего действует *</label>
          <input name="basis" defaultValue={organization.basis ?? ""} required className={inputClass} placeholder="Устава, приказа, уведомления о начале деятельности..." />
        </div>

        <div>
          <label className={labelClass}>Юридический адрес *</label>
          <input name="legalAddress" defaultValue={organization.legalAddress ?? ""} required className={inputClass} placeholder="РК, город, улица, дом, офис" />
        </div>
        <div>
          <label className={labelClass}>Фактический адрес</label>
          <input name="actualAddress" defaultValue={organization.actualAddress ?? ""} className={inputClass} placeholder="Если отличается от юридического" />
        </div>

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
        <div>
          <label className={labelClass}>Телефон владельца</label>
          <input name="phone" defaultValue={organization.phone ?? ""} className={inputClass} placeholder="+7 7XX XXX XX XX" />
        </div>
        <div>
          <label className={labelClass}>Email владельца</label>
          <input name="email" defaultValue={organization.email ?? ""} className={inputClass} placeholder="owner@example.com" />
        </div>
        <div className="flex items-end justify-end">
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
