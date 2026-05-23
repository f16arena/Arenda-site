/**
 * Каталог разовых услуг (concierge-апсейл по плану §9).
 * Клиент заказывает → OrganizationService(status=PENDING) → суперадмин
 * принимает оплату (status=PAID, paidAt) → сдаёт работу (DELIVERED, deliveredAt).
 */
export type ServiceCatalogItem = {
  code: string
  label: string
  description: string
  /** Цена в ₸. Для интеграций ниже есть recurringMonthly для абонентки. */
  price: number
  /** Опциональная ежемесячная подписка поверх разовой (1С). */
  recurringMonthly?: number
  /** Если задан — услуга показывается только клиентам с этим планом. */
  requiresPlan?: string[]
  /** Если задан — наоборот, недоступна на этих планах (например, Pro+ получает услугу бесплатно). */
  hiddenForPlans?: string[]
}

export const SERVICES_CATALOG: ServiceCatalogItem[] = [
  {
    code: "ONBOARDING_PRO",
    label: "Onboarding под ключ (Pro)",
    description: "Заводим арендаторов, договоры, помещения за вас. Один созвон + 1 рабочий день.",
    price: 199_000,
    requiresPlan: ["PRO", "BUSINESS"],
  },
  {
    code: "ONBOARDING_ENTERPRISE",
    label: "Onboarding Enterprise",
    description: "Полная миграция нескольких объектов, обучение команды, кастомизация.",
    price: 499_000,
    requiresPlan: ["ENTERPRISE"],
  },
  {
    code: "LEGAL_PACK_KZ",
    label: "Юр.пакет «Договоры РК»",
    description: "15-20 готовых шаблонов: аренда, доп.соглашения, претензии, расторжение — под РК.",
    price: 79_000,
  },
  {
    code: "ONE_C_INTEGRATION",
    label: "Интеграция с 1С/BAS",
    description: "Двусторонний обмен начислениями и платежами с вашей конфигурацией 1С.",
    price: 49_000,
    recurringMonthly: 7_900,
    requiresPlan: ["BUSINESS", "ENTERPRISE"],
  },
  {
    code: "EXCEL_MIGRATION_STARTER",
    label: "Платная миграция из Excel (Starter)",
    description: "Перенесём ваш Excel за 1 день. Для Pro и выше — бесплатно, см. бонусы тарифа.",
    price: 19_900,
    requiresPlan: ["STARTER"],
  },
  {
    code: "ADMIN_TRAINING",
    label: "Обучение администратора",
    description: "3 сессии по 60 минут: документы, финансы, кабинет арендатора.",
    price: 29_000,
  },
]

export function servicesForPlan(planCode: string | null | undefined): ServiceCatalogItem[] {
  if (!planCode) return SERVICES_CATALOG.filter((s) => !s.requiresPlan)
  return SERVICES_CATALOG.filter((s) => {
    if (s.hiddenForPlans?.includes(planCode)) return false
    if (s.requiresPlan && !s.requiresPlan.includes(planCode)) return false
    return true
  })
}
