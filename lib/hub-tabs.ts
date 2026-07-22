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

export const ANALYTICS_TABS = [
  { href: "/admin/analytics", label: "Аналитика" },
  { href: "/admin/dashboard/owner", label: "Финансовый дашборд" },
  { href: "/admin/reports", label: "Отчётность" },
]

export const DOCUMENTS_TABS = [
  { href: "/admin/documents", label: "Все документы" },
  { href: "/admin/contracts", label: "Договоры" },
]
