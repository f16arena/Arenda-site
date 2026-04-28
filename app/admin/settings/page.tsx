import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { updateBuilding, updateFloor, updateEmergencyContact, addEmergencyContact, deleteEmergencyContact } from "@/app/actions/building"
import { createTariff, updateTariff, deleteTariff } from "@/app/actions/tariffs"
import { Building2, Phone, Layers, Plus, Zap } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { DeleteAction } from "@/components/ui/delete-action"
import { getCurrentBuildingId } from "@/lib/current-building"

export default async function SettingsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const buildingId = await getCurrentBuildingId()
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
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <p className="text-sm text-amber-800 mb-2">Здание не выбрано</p>
        <a href="/admin/buildings" className="text-xs text-amber-700 underline">Перейти к списку зданий →</a>
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
        <h1 className="text-2xl font-semibold text-slate-900">Настройки объекта</h1>
        <p className="text-sm text-slate-500 mt-0.5">Управление информацией о бизнес-центре</p>
      </div>

      {/* Building info */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
          <Building2 className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Основные сведения</h2>
        </div>
        <ServerForm
          action={updateBuilding.bind(null, building.id)}
          successMessage="Данные здания сохранены"
          className="p-5 grid grid-cols-2 gap-4"
        >
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Название</label>
              <input
                name="name"
                defaultValue={building.name}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Адрес</label>
              <input
                name="address"
                defaultValue={building.address}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Телефон</label>
            <input
              name="phone"
              defaultValue={building.phone ?? ""}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={building.email ?? ""}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Ответственный</label>
            <input
              name="responsible"
              defaultValue={building.responsible ?? ""}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Общая площадь, м²</label>
            <input
              name="totalArea"
              type="number"
              step="0.01"
              defaultValue={building.totalArea ?? ""}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Описание</label>
            <textarea
              name="description"
              rows={2}
              defaultValue={building.description ?? ""}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
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

      {/* Floors */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
          <Layers className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Этажи и ставки</h2>
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
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Название этажа</label>
                <input
                  name="name"
                  defaultValue={floor.name}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Ставка ₸/м²</label>
                <input
                  name="ratePerSqm"
                  type="number"
                  step="0.01"
                  defaultValue={floor.ratePerSqm}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Площадь этажа, м²</label>
                <input
                  name="totalArea"
                  type="number"
                  step="0.01"
                  defaultValue={floor.totalArea ?? ""}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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

      {/* Tariffs */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
          <Zap className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Тарифы коммунальных услуг</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {building.tariffs.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-400 text-center">Тарифы не настроены — добавьте ниже</p>
          )}
          {building.tariffs.map((t) => (
            <ServerForm
              key={t.id}
              action={updateTariff.bind(null, t.id)}
              successMessage={`Тариф «${t.name}» сохранён`}
              className="px-5 py-4 grid grid-cols-[120px_1fr_120px_100px_auto] gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Тип</label>
                <p className="px-3 py-2 text-xs text-slate-600 bg-slate-50 rounded-lg border border-slate-200">{t.type}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Название</label>
                <input
                  name="name"
                  defaultValue={t.name}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Тариф ₸</label>
                <input
                  name="rate"
                  type="number"
                  step="0.01"
                  defaultValue={t.rate}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Ед.</label>
                <input
                  name="unit"
                  defaultValue={t.unit}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
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
          className="border-t border-dashed border-slate-200 px-5 py-4 grid grid-cols-[120px_1fr_120px_100px_auto] gap-3 items-end bg-slate-50/50"
        >
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Тип *</label>
            <select name="type" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="ELECTRICITY">Электр-во</option>
              <option value="WATER">Вода</option>
              <option value="HEATING">Отопление</option>
              <option value="GARBAGE">Мусор</option>
              <option value="INTERNET">Интернет</option>
              <option value="OTHER">Прочее</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Название *</label>
            <input name="name" placeholder="Электроэнергия" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Тариф ₸ *</label>
            <input name="rate" type="number" step="0.01" placeholder="22" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Ед. *</label>
            <input name="unit" placeholder="кВт·ч" required defaultValue="ед." className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
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
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900">Экстренные контакты</h2>
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
                <p className="text-xs text-slate-400 mb-1">{CATEGORY_LABELS[ec.category] ?? ec.category}</p>
                <input
                  name="name"
                  defaultValue={ec.name}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Телефон</label>
                <input
                  name="phone"
                  defaultValue={ec.phone}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
          className="border-t border-dashed border-slate-200 px-5 py-4 grid grid-cols-4 gap-3 items-end bg-slate-50/50"
        >
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Категория</label>
            <select
              name="category"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white"
            >
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Название</label>
            <input
              name="name"
              placeholder="Служба..."
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Телефон</label>
            <input
              name="phone"
              placeholder="+7..."
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
