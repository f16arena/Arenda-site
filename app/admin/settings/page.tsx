import Link from "next/link"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { updateBuilding, updateFloor } from "@/app/actions/building"
import { createTariff, updateTariff, deleteTariff } from "@/app/actions/tariffs"
import { Building2, Layers, Plus, Zap, Settings as SettingsIcon } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { DeleteAction } from "@/components/ui/delete-action"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { CollapsibleCard } from "@/components/settings/collapsible-card"
import { DocNumberStartSection } from "@/components/settings/doc-number-start-section"
import { getDocNumberingState } from "@/lib/document-number"
import { VatSection } from "@/components/settings/vat-section"
import { AdditionalChargesSection } from "@/components/settings/additional-charges-section"
import { TaxSettingsSection } from "@/components/settings/tax-settings-section"
import { PenaltySettingsSection } from "@/components/settings/penalty-settings-section"
import { OrganizationRequisitesSection } from "@/components/settings/organization-requisites-section"
import { BrandingSection } from "@/components/settings/branding-section"
import { EsfSection } from "@/components/settings/esf-section"
import { ORGANIZATION_REQUISITES_SELECT } from "@/lib/organization-requisites"
import { safeServerValue } from "@/lib/server-fallback"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { AsciiEmailInput, KzPhoneInput } from "@/components/forms/contact-inputs"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page"

const SETTINGS_TABS = [
  { key: "org", label: "Организация" },
  { key: "money", label: "Документы и деньги" },
  { key: "building", label: "Здание" },
] as const

type SettingsTab = (typeof SETTINGS_TABS)[number]["key"]

function normalizeTab(value: string | string[] | undefined): SettingsTab {
  const raw = Array.isArray(value) ? value[0] : value
  return SETTINGS_TABS.some((item) => item.key === raw) ? raw as SettingsTab : "org"
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[] }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const tab = normalizeTab((await searchParams)?.tab)
  // Гранулярные права: изменяющие секции настроек показываются только при наличии
  // соответствующего права. OWNER/платформенный админ получают все права.
  // Реквизиты арендодателя содержат и общие реквизиты, и банковские счета в одной
  // форме (одна кнопка «Сохранить реквизиты»), поэтому показываем секцию при любом
  // из двух прав.
  const caps = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: !!session.user.isPlatformOwner,
    orgId,
  }))
  const canEditOrg = caps.has("settings.updateOrganization")
  const canEditRequisites = canEditOrg || caps.has("settings.updateBankDetails")
  // Оборачиваем запросы в safeServerValue (как остальные admin-страницы): при
  // транзиентном сбое пула/запроса страница деградирует, а не падает в
  // Server Components render error.
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/settings", orgId, userId: session.user.id })

  const [organization, buildingId] = await Promise.all([
    safe(
      "admin.settings.organization",
      db.organization.findUnique({
        where: { id: orgId },
        select: {
          ...ORGANIZATION_REQUISITES_SELECT,
          isVatPayer: true,
          vatRate: true,
          vatNumber: true,
          defaultPenaltyPercent: true,
          penaltyGraceDays: true,
          features: true,
          logoUrl: true,
        },
      }),
      null,
    ),
    getCurrentBuildingId(),
  ])

  // Реквизиты ЭСФ (для владельца). Секреты в ответ не отдаём — только признак «задан».
  const esfRow = session.user.role === "OWNER"
    ? await safe(
        "admin.settings.esfConfig",
        db.orgEsfConfig.findUnique({
          where: { organizationId: orgId },
          select: { enabled: true, wsUsername: true, signerIin: true, certPath: true, wsPasswordEnc: true, certPinEnc: true, certFileName: true, esfGsvsCode: true },
        }),
        null,
      )
    : null
  const esfConfig = esfRow
    ? {
        enabled: esfRow.enabled,
        wsUsername: esfRow.wsUsername,
        signerIin: esfRow.signerIin,
        certPath: esfRow.certPath,
        hasPassword: !!esfRow.wsPasswordEnc,
        hasPin: !!esfRow.certPinEnc,
        certFileName: esfRow.certFileName,
        gsvsCode: esfRow.esfGsvsCode,
      }
    : null
  const building = buildingId
    ? await safe(
        "admin.settings.building",
        db.building.findUnique({
          where: { id: buildingId },
          include: {
            floors: { orderBy: { number: "desc" } },
            emergencyContacts: { orderBy: { category: "asc" } },
            tariffs: { orderBy: { type: "asc" } },
          },
        }),
        null,
      )
    : null

  if (!building) {
    return (
      <div className="max-w-6xl space-y-5">
        <PageHeader icon={SettingsIcon} title="Настройки" subtitle="Реквизиты организации и параметры объектов" />
        {organization && canEditRequisites && (
          <section id="organization-requisites">
            <OrganizationRequisitesSection organization={organization} />
          </section>
        )}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="mb-2 text-sm text-amber-800 dark:text-amber-200">Здание не выбрано</p>
          <a href="/admin/buildings" className="text-xs text-amber-700 underline dark:text-amber-300">Перейти к списку зданий →</a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Настройки</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Здание «{building.name}». Личные данные — ФИО, пароль, вход — в{" "}
          <Link href="/admin/profile" className="text-blue-600 hover:underline dark:text-blue-400">профиле</Link>.
        </p>
      </div>

      <SettingsTabs active={tab} />

      {tab === "org" && (
        <div className="space-y-4">
          {organization && canEditRequisites && (
            <section id="organization-requisites">
              <OrganizationRequisitesSection organization={organization} />
            </section>
          )}
          {organization && canEditOrg && <VatSection organization={organization} />}
          {organization && canEditOrg && <TaxSettingsSection organization={organization} />}
          {session.user.role === "OWNER" && <EsfSection config={esfConfig} />}
          {/* Брендирование: логотип организации в сайдбаре (только владелец) */}
          {session.user.role === "OWNER" && (
            <BrandingSection currentLogoUrl={organization?.logoUrl ?? null} />
          )}
        </div>
      )}

      {tab === "money" && (
        <div className="space-y-4">
          {canEditOrg && <DocNumberStartSection orgId={orgId} rows={await getDocNumberingState(orgId)} />}
          {organization && canEditOrg && <PenaltySettingsSection organization={organization} />}
          {organization && canEditOrg && <AdditionalChargesSection organization={organization} />}
        </div>
      )}

      {tab === "building" && (
        <div className="space-y-4">
          {/* Building info */}
          {canEditOrg && (
          <div id="building-settings">
          <CollapsibleCard title="Основные сведения" icon={<Building2 className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}>
            <ServerForm
              action={updateBuilding.bind(null, building.id)}
              successMessage="Данные здания сохранены"
              className="p-5 grid grid-cols-2 gap-4"
            >
              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Название</label>
                  <input
                    name="name"
                    defaultValue={building.name}
                    required
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Адрес</label>
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

              {/* Адрес для документов — необязательный. Нужен потому что автокомплит
                  часто возвращает адрес с казахскими названиями («Шығыс Қазақстан
                  облысы»), а в договоры/акты нужно по-русски. Если пусто — берётся
                  обычный адрес. */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Адрес для документов <span className="text-slate-400 dark:text-slate-500 font-normal">— перекрывает обычный в договорах и актах</span>
                </label>
                <input
                  name="documentAddress"
                  defaultValue={building.documentAddress ?? ""}
                  placeholder="например: улица 30-й гвардейской дивизии, 24/1, г. Усть-Каменогорск, Восточно-Казахстанская область"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Если оставить пустым — в документах используется обычный адрес (часто на казахском от автокомплита).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Телефон здания</label>
                <KzPhoneInput
                  name="phone"
                  defaultValue={building.phone ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Контакт этого здания (для арендаторов). Контакт арендодателя — в «Реквизитах».</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Email здания</label>
                <AsciiEmailInput
                  name="email"
                  defaultValue={building.email ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Ответственный</label>
                <input
                  name="responsible"
                  defaultValue={building.responsible ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Общая площадь, м²</label>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={building.totalArea ?? ""}
                  readOnly
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Рассчитывается автоматически из общей площади этажей.
                </p>
              </div>
              {/* Услуги в эксп. сборе: чекбоксы 2026-05-27.
                  Если услуга отмечена — она уже включена в эксплуатационный сбор,
                  не выставляется арендатору отдельной строкой и не появляется
                  в форме «Доп. начисления» в карточке арендатора. */}
              <div className="col-span-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <input type="hidden" name="utilities_in_service_fee_form" value="1" />
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Включено в эксплуатационный сбор
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                  Отметьте услуги которые УЖЕ покрываются эксп. сбором. Они не будут выставляться арендатору отдельной строкой и не появятся в форме «Доп. начисления».
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  {(() => {
                    const inServiceFee = (() => {
                      try {
                        if (!building.utilitiesInServiceFee) return new Set<string>()
                        const parsed = JSON.parse(building.utilitiesInServiceFee)
                        return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : new Set<string>()
                      } catch { return new Set<string>() }
                    })()
                    const items: Array<[string, string]> = [
                      ["ELECTRICITY", "Свет"],
                      ["WATER", "Вода"],
                      ["GARBAGE", "Вывоз мусора"],
                      ["HEATING", "Отопление"],
                      ["SECURITY", "Охрана"],
                      ["INTERNET", "Интернет"],
                    ]
                    return items.map(([type, label]) => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800">
                        <input
                          type="checkbox"
                          name="utilities_in_service_fee"
                          value={type}
                          defaultChecked={inServiceFee.has(type)}
                          className="rounded border-slate-300"
                        />
                        <span className="text-slate-700 dark:text-slate-300">{label}</span>
                      </label>
                    ))
                  })()}
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Описание</label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={building.description ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <Button
                  type="submit"
                  size="lg"
                  className="font-medium"
                >
                  Сохранить
                </Button>
              </div>
            </ServerForm>
          </CollapsibleCard>
          </div>
          )}
          {/* Floors */}
          {canEditOrg && (
          <CollapsibleCard title="Этажи и ставки" icon={<Layers className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}>
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {building.floors.map((floor) => (
                <ServerForm
                  key={floor.id}
                  action={updateFloor.bind(null, floor.id)}
                  successMessage={`${floor.name} сохранён`}
                  className="px-5 py-4 grid grid-cols-4 gap-3 items-end"
                >
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Название этажа</label>
                    <input
                      name="name"
                      defaultValue={floor.name}
                      required
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Ставка ₸/м²</label>
                    <input
                      name="ratePerSqm"
                      type="number"
                      step="0.01"
                      defaultValue={floor.ratePerSqm}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Площадь этажа, м²</label>
                    <input
                      name="totalArea"
                      type="number"
                      step="0.01"
                      defaultValue={floor.totalArea ?? ""}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="font-medium"
                    >
                      Сохранить
                    </Button>
                  </div>
                </ServerForm>
              ))}
        </div>
      </CollapsibleCard>

      )}
      {/* Tariffs */}
      {canEditOrg && (
      <CollapsibleCard title="Тарифы коммунальных услуг" icon={<Zap className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}>
        <div className="divide-y divide-slate-50 dark:divide-slate-800">
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
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Тип</label>
                <p className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">{t.type}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Название</label>
                <input
                  name="name"
                  defaultValue={t.name}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Тариф ₸</label>
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
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Ед.</label>
                <input
                  name="unit"
                  defaultValue={t.unit}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <input type="checkbox" name="isActive" defaultChecked={t.isActive} className="rounded" />
                  Активен
                </label>
                <Button type="submit" className="font-medium">
                  Сохранить
                </Button>
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
          className="border-t border-dashed border-slate-200 dark:border-slate-800 px-5 py-4 grid grid-cols-[120px_1fr_120px_100px_auto] gap-3 items-end bg-slate-50 dark:bg-slate-800/50"
        >
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Тип *</label>
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
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Название *</label>
            <input name="name" placeholder="Электроэнергия" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Тариф ₸ *</label>
            <input name="rate" type="number" step="0.01" placeholder="22" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Ед. *</label>
            <input name="unit" placeholder="кВт·ч" required defaultValue="ед." className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              <Plus className="h-4 w-4" />
              Добавить
            </button>
          </div>
        </ServerForm>
      </CollapsibleCard>
      )}

      {/* Emergency contacts */}
        </div>
      )}
    </div>
  )
}

/** Вкладки настроек: адрес вида /admin/settings?tab=money. */
function SettingsTabs({ active }: { active: SettingsTab }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800" aria-label="Разделы настроек">
      {SETTINGS_TABS.map((item) => (
        <Link
          key={item.key}
          href={item.key === "org" ? "/admin/settings" : `/admin/settings?tab=${item.key}`}
          aria-current={active === item.key ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            active === item.key
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

