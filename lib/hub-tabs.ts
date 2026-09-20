// Хабы редизайна (этап 1, docs/REDESIGN-PLAN.md): связанные страницы выглядят
// одним разделом со вкладками (components/ui/route-tabs). Одна задача — одно
// место входа; роуты и права страниц сохраняются.

export const TEAM_TABS = [
  { href: "/admin/staff", label: "Сотрудники" },
  { href: "/admin/users", label: "Доступы и здания" },
  { href: "/admin/roles", label: "Роли и права" },
]

export const HEALTH_TABS = [
  { href: "/admin/onboarding", label: "Здоровье платформы" },
  { href: "/admin/data-quality", label: "Качество данных" },
  { href: "/admin/system-health", label: "Проверка системы" },
]

export const DOCUMENTS_TABS = [
  { href: "/admin/documents", label: "Все документы" },
  { href: "/admin/contracts", label: "Договоры" },
]

export const IMPORT_TABS = [
  { href: "/admin/import/tenants", label: "Арендаторы" },
  { href: "/admin/import/contracts", label: "Договоры" },
  { href: "/admin/import/charges", label: "Начисления" },
  { href: "/admin/finances/import", label: "Платежи из банка" },
]

// История: что делали люди и что ушло арендаторам на почту. Раньше это были
// два отдельных пункта меню — «Журнал операций» и «Журнал email».
export const HISTORY_TABS = [
  { href: "/admin/audit", label: "Действия" },
  { href: "/admin/email-logs", label: "Письма" },
]

export const SERVICE_TABS = [
  { href: "/admin/requests", label: "Заявки" },
  { href: "/admin/complaints", label: "Жалобы и предложения" },
]

// Финансы: месяц (начисления, оплаты, расходы) + разделы, которые раньше были
// шестью разноцветными кнопками в шапке страницы.
export const FINANCE_TABS = [
  { href: "/admin/finances", label: "Месяц" },
  { href: "/admin/finances/deposits", label: "Депозиты" },
  { href: "/admin/finances/installments", label: "Рассрочки" },
  { href: "/admin/finances/recurring", label: "Постоянные расходы" },
  { href: "/admin/finances/balance", label: "Счета и касса" },
]
