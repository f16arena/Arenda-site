import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Check, X, Shield } from "lucide-react"

type Permission = {
  section: string
  items: {
    label: string
    OWNER: boolean
    ADMIN: boolean
    ACCOUNTANT: boolean
    FACILITY_MANAGER: boolean
  }[]
}

const PERMISSIONS: Permission[] = [
  {
    section: "Арендаторы",
    items: [
      { label: "Просмотр списка арендаторов",         OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
      { label: "Открыть карточку арендатора",         OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
      { label: "Редактировать данные арендатора",     OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: false },
      { label: "Добавить нового арендатора",          OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: false },
      { label: "Просмотр реквизитов",                 OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
    ],
  },
  {
    section: "Помещения",
    items: [
      { label: "Просмотр карты помещений",            OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: true  },
      { label: "Редактировать план этажа",            OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: true  },
      { label: "Назначить помещение арендатору",      OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: false },
    ],
  },
  {
    section: "Финансы",
    items: [
      { label: "Просмотр начислений и платежей",      OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
      { label: "Внести платёж",                       OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
      { label: "Создать начисление / штраф",          OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
      { label: "Генерировать ежемесячные начисления", OWNER: true,  ADMIN: false, ACCOUNTANT: true,  FACILITY_MANAGER: false },
      { label: "Просмотр расходов здания",            OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
      { label: "Добавить расход",                     OWNER: true,  ADMIN: false, ACCOUNTANT: true,  FACILITY_MANAGER: false },
    ],
  },
  {
    section: "Документы",
    items: [
      { label: "Просмотр договоров",                  OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
      { label: "Создать / распечатать договор",       OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: false },
      { label: "Отметить договор как подписанный",    OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: false },
    ],
  },
  {
    section: "Задачи",
    items: [
      { label: "Просмотр задач",                      OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: true  },
      { label: "Создать задачу",                      OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: true  },
      { label: "Изменить статус задачи",              OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: true  },
      { label: "Просмотр стоимости задач",            OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
    ],
  },
  {
    section: "Заявки",
    items: [
      { label: "Просмотр всех заявок",                OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: true  },
      { label: "Принять / назначить заявку",          OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: true  },
      { label: "Комментировать заявки",               OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: true  },
    ],
  },
  {
    section: "Персонал",
    items: [
      { label: "Просмотр сотрудников",                OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
      { label: "Добавить / уволить сотрудника",       OWNER: true,  ADMIN: false, ACCOUNTANT: false, FACILITY_MANAGER: false },
      { label: "Редактировать оклад",                 OWNER: true,  ADMIN: false, ACCOUNTANT: true,  FACILITY_MANAGER: false },
    ],
  },
  {
    section: "Аналитика и отчёты",
    items: [
      { label: "Просмотр аналитики",                  OWNER: true,  ADMIN: true,  ACCOUNTANT: true,  FACILITY_MANAGER: false },
      { label: "Экспорт отчётов",                     OWNER: true,  ADMIN: false, ACCOUNTANT: true,  FACILITY_MANAGER: false },
    ],
  },
  {
    section: "Настройки",
    items: [
      { label: "Настройки здания",                    OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: false },
      { label: "Управление ролями (просмотр)",        OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: false },
      { label: "Экстренные контакты",                 OWNER: true,  ADMIN: true,  ACCOUNTANT: false, FACILITY_MANAGER: true  },
    ],
  },
]

const ROLE_COLS = [
  { key: "OWNER" as const,            label: "Владелец",      color: "text-purple-700 bg-purple-50" },
  { key: "ADMIN" as const,            label: "Администратор", color: "text-blue-700 bg-blue-50" },
  { key: "ACCOUNTANT" as const,       label: "Бухгалтер",     color: "text-green-700 bg-green-50" },
  { key: "FACILITY_MANAGER" as const, label: "Завхоз",        color: "text-orange-700 bg-orange-50" },
]

export default async function RolesPage() {
  const session = await auth()
  if (!session || !["OWNER", "ADMIN"].includes(session.user.role)) redirect("/admin")

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-slate-700" />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Права доступа по ролям</h1>
          <p className="text-sm text-slate-500 mt-0.5">Матрица прав для административных ролей</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        Права доступа в данный момент фиксированы. Редактор прав (тонкая настройка) будет добавлен в следующей версии.
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3.5 text-left text-xs font-medium text-slate-500 w-1/2">Действие</th>
              {ROLE_COLS.map((r) => (
                <th key={r.key} className="px-4 py-3.5 text-center">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${r.color}`}>{r.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((section) => (
              <>
                <tr key={`section-${section.section}`} className="border-b border-slate-100 bg-slate-50/50">
                  <td colSpan={5} className="px-5 py-2">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{section.section}</span>
                  </td>
                </tr>
                {section.items.map((item, i) => (
                  <tr key={`${section.section}-${i}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-5 py-2.5 text-slate-700">{item.label}</td>
                    {ROLE_COLS.map((r) => (
                      <td key={r.key} className="px-4 py-2.5 text-center">
                        {item[r.key] ? (
                          <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-slate-200 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tenant role note */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm font-semibold text-slate-900 mb-3">Роль: Арендатор (Личный кабинет)</p>
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
          {[
            "Просмотр своего баланса и начислений",
            "Просмотр своих платёжных реквизитов",
            "Просмотр своих договоров",
            "Подача заявок и обращений",
            "Просмотр своих заявок",
            "Просмотр экстренных контактов",
            "Показания счётчиков (ввод)",
          ].map((p) => (
            <div key={p} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-teal-500 shrink-0" />
              {p}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
