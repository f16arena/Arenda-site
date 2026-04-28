import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { updateBuilding, updateFloor, updateEmergencyContact, addEmergencyContact, deleteEmergencyContact } from "@/app/actions/building"
import { Building2, Phone, Layers, Plus } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { DeleteAction } from "@/components/ui/delete-action"

export default async function SettingsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const building = await db.building.findFirst({
    where: { isActive: true },
    include: {
      floors: { orderBy: { number: "desc" } },
      emergencyContacts: { orderBy: { category: "asc" } },
    },
  })

  if (!building) return <p className="text-slate-500">Здание не найдено</p>

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
