import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { updateBuilding, updateFloor, updateEmergencyContact, addEmergencyContact, deleteEmergencyContact } from "@/app/actions/building"
import { createTariff, updateTariff, deleteTariff } from "@/app/actions/tariffs"
import { ArrowRight, Building2, FileText, Phone, Layers, Plus, Zap } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { DeleteAction } from "@/components/ui/delete-action"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { DocumentNumberingSection } from "@/components/settings/document-numbering-section"
import { VatSection } from "@/components/settings/vat-section"
import { OrganizationRequisitesSection } from "@/components/settings/organization-requisites-section"
import { ORGANIZATION_REQUISITES_SELECT } from "@/lib/organization-requisites"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { AsciiEmailInput, KzPhoneInput } from "@/components/forms/contact-inputs"

export default async function SettingsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const [organization, buildingId] = await Promise.all([
    db.organization.findUnique({
      where: { id: orgId },
      select: {
        ...ORGANIZATION_REQUISITES_SELECT,
        isVatPayer: true,
        vatRate: true,
        vatNumber: true,
      },
    }),
    getCurrentBuildingId(),
  ])
  const building = buildingId ? await db.building.findUnique({
    where: { id: buildingId },
    include: {
      floors: { orderBy: { number: "desc" } },
      emergencyContacts: { orderBy: { category: "asc" } },
      tariffs: { orderBy: { type: "asc" } },
    },
  }) : null

  if (!building) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Настройки</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Реквизиты организации и параметры объектов</p>
        </div>
        {organization && <OrganizationRequisitesSection organization={organization} />}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="mb-2 text-sm text-amber-800 dark:text-amber-200">Здание не выбрано</p>
          <a href="/admin/buildings" className="text-xs text-amber-700 underline dark:text-amber-300">Перейти к списку зданий →</a>
        </div>
      </div>
    )
  }

  const CATEGORY_LABELS: Record<string, string> = {
    WATER: "Водоснабжение",
    ELECTRICITY: "Электросети",
    GAS: "Газовая служба",
    FIRE: "Пожарная служба",
    POLICE: "Полиция",
    AMBULANCE: "Скорая помощь",
    OTHER: "Другое",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Настройки объекта</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Управление информацией о бизнес-центре</p>
      </div>

      {/* Building info */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <Building2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Основные сведения</h2>
        </div>
        <ServerForm
          action={updateBuilding.bind(null, building.id)}
          successMessage="Данные здания сохранены"
          className="p-5 grid grid-cols-2 gap-4"
        >
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Название</label>
              <input
                name="name"
                defaultValue={building.name}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Адрес</label>
              <AddressAutocompleteInput
                name="address"
                defaultValue={building.address}
                defaultFields={{
                  countryCode: building.addressCountryCode,
                  region: building.addressRegion,
                  city: building.addressCity,
                  settlement: building.addressSettlement,
                  street: building.addressStreet,
                  houseNumber: building.addressHouseNumber,
                  postcode: building.addressPostcode,
                  latitude: building.addressLatitude,
                  longitude: building.addressLongitude,
                  source: building.addressSource,
                  sourceId: building.addressSourceId,
                }}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Телефон</label>
            <KzPhoneInput
              name="phone"
              defaultValue={building.phone ?? ""}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Email</label>
            <AsciiEmailInput
              name="email"
              defaultValue={building.email ?? ""}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Ответственный</label>
            <input
              name="responsible"
              defaultValue={building.responsible ?? ""}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Общая площадь, м²</label>
            <input
              name="totalArea"
              type="number"
              step="0.01"
              defaultValue={building.totalArea ?? ""}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Описание</label>
            <textarea
              name="description"
              rows={2}
              defaultValue={building.description ?? ""}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>
          <div className="col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Сохранить
            </button>
          </div>
        </ServerForm>
      </div>

      {organization && <OrganizationRequisitesSection organization={organization} />}

      {/* Floors */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <Layers className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Этажи и ставки</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {building.floors.map((floor) => (
            <ServerForm
              key={floor.id}
              action={updateFloor.bind(null, floor.id)}
              successMessage={`${floor.name} сохранён`}
              className="px-5 py-4 grid grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Название этажа</label>
                <input
                  name="name"
                  defaultValue={floor.name}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Ставка ₸/м²</label>
                <input
                  name="ratePerSqm"
                  type="number"
                  step="0.01"
                  defaultValue={floor.ratePerSqm}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Площадь этажа, м²</label>
                <input
                  name="totalArea"
                  type="number"
                  step="0.01"
                  defaultValue={floor.totalArea ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
                >
                  Сохранить
                </button>
              </div>
            </ServerForm>
          ))}
        </div>
      </div>

      {/* НДС настройки */}
      {organization && <VatSection organization={organization} />}

      {/* Document numbering */}
      <DocumentNumberingSection building={building} />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Шаблоны документов</h2>
        </div>
        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">DOCX/XLSX для договора, счёта, АВР и акта сверки</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Настраиваются один раз и используются при создании документов.</p>
          </div>
          <a
            href="/admin/settings/document-templates"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Открыть
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Tariffs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <Zap className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Тарифы коммунальных услуг</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {building.tariffs.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-400 dark:text-slate-500 text-center">Тарифы не настроены — добавьте ниже</p>
          )}
          {building.tariffs.map((t) => (
            <ServerForm
              key={t.id}
              action={updateTariff.bind(null, t.id)}
              successMessage={`Тариф «${t.name}» сохранён`}
              className="px-5 py-4 grid grid-cols-[120px_1fr_120px_100px_auto] gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Тип</label>
                <p className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">{t.type}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Название</label>
                <input
                  name="name"
                  defaultValue={t.name}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Тариф ₸</label>
                <input
                  name="rate"
                  type="number"
                  step="0.01"
                  defaultValue={t.rate}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Ед.</label>
                <input
                  name="unit"
                  defaultValue={t.unit}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <input type="checkbox" name="isActive" defaultChecked={t.isActive} className="rounded" />
                  Активен
                </label>
                <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  Сохранить
                </button>
                <DeleteAction
                  action={deleteTariff.bind(null, t.id)}
                  entity="тариф"
                  successMessage="Тариф удалён"
                />
              </div>
            </ServerForm>
          ))}
        </div>

        {/* Add new tariff */}
        <ServerForm
          action={createTariff.bind(null, building.id)}
          successMessage="Тариф добавлен"
          className="border-t border-dashed border-slate-200 dark:border-slate-800 px-5 py-4 grid grid-cols-[120px_1fr_120px_100px_auto] gap-3 items-end bg-slate-50 dark:bg-slate-800/50/50"
        >
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Тип *</label>
            <select name="type" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
              <option value="ELECTRICITY">Электр-во</option>
              <option value="WATER">Вода</option>
              <option value="HEATING">Отопление</option>
              <option value="GARBAGE">Мусор</option>
              <option value="INTERNET">Интернет</option>
              <option value="OTHER">Прочее</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Название *</label>
            <input name="name" placeholder="Электроэнергия" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Тариф ₸ *</label>
            <input name="rate" type="number" step="0.01" placeholder="22" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Ед. *</label>
            <input name="unit" placeholder="кВт·ч" required defaultValue="ед." className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              <Plus className="h-4 w-4" />
              Добавить
            </button>
          </div>
        </ServerForm>
      </div>

      {/* Emergency contacts */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Экстренные контакты</h2>
          </div>
        </div>
        <div className="divide-y divide-slate-50">
          {building.emergencyContacts.map((ec) => (
            <ServerForm
              key={ec.id}
              action={updateEmergencyContact.bind(null, ec.id)}
              successMessage="Контакт обновлён"
              className="px-5 py-3.5 grid grid-cols-4 gap-3 items-center"
            >
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{CATEGORY_LABELS[ec.category] ?? ec.category}</p>
                <input
                  name="name"
                  defaultValue={ec.name}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Телефон</label>
                <input
                  name="phone"
                  defaultValue={ec.phone}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
                >
                  Сохранить
                </button>
                <DeleteAction
                  action={deleteEmergencyContact.bind(null, ec.id)}
                  entity="контакт"
                  successMessage="Контакт удалён"
                />
              </div>
            </ServerForm>
          ))}
        </div>

        {/* Add new contact */}
        <ServerForm
          action={addEmergencyContact.bind(null, building.id)}
          successMessage="Контакт добавлен"
          className="border-t border-dashed border-slate-200 dark:border-slate-800 px-5 py-4 grid grid-cols-4 gap-3 items-end bg-slate-50 dark:bg-slate-800/50/50"
        >
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Категория</label>
            <select
              name="category"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900"
            >
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Название</label>
            <input
              name="name"
              placeholder="Служба..."
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Телефон</label>
            <input
              name="phone"
              placeholder="+7..."
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Добавить
            </button>
          </div>
        </ServerForm>
      </div>
    </div>
  )
}
