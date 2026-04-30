export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { Phone, Plus } from "lucide-react"

const categoryLabel: Record<string, string> = {
  WATER: "Водоканал",
  ELECTRICITY: "Электросети",
  GAS: "Газовая служба",
  FIRE: "Пожарная служба",
  POLICE: "Полиция",
  AMBULANCE: "Скорая помощь",
  OTHER: "Прочее",
}

const categoryColor: Record<string, string> = {
  WATER: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
  ELECTRICITY: "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
  GAS: "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300",
  FIRE: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300",
  POLICE: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  AMBULANCE: "bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300",
  OTHER: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500",
}

export default async function EmergencyPage() {
  const building = await db.building.findFirst({ where: { isActive: true } })
  const contacts = building
    ? await db.emergencyContact.findMany({ where: { buildingId: building.id } })
    : []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Экстренные контакты</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{contacts.length} контактов</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" />
          Добавить
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {contacts.map((c) => (
          <div key={c.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
              <Phone className="h-4 w-4 text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.name}</p>
              <p className="text-base font-bold text-slate-800 dark:text-slate-200 mt-0.5">{c.phone}</p>
              <span className={`mt-1 inline-block px-2 py-0.5 rounded text-xs font-medium ${categoryColor[c.category] ?? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500"}`}>
                {categoryLabel[c.category] ?? c.category}
              </span>
            </div>
          </div>
        ))}
        {contacts.length === 0 && (
          <div className="col-span-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-16 text-center">
            <Phone className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400 dark:text-slate-500">Контакты не добавлены</p>
          </div>
        )}
      </div>
    </div>
  )
}
