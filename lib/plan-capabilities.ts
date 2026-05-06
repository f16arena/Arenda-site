export type PlanCapabilityRisk = "normal" | "business" | "sensitive"

export type PlanCapability = {
  key: string
  label: string
  description: string
  group: string
  risk?: PlanCapabilityRisk
  recommended?: boolean
}

export type PlanCapabilityGroup = {
  key: string
  label: string
  description: string
  capabilities: readonly PlanCapability[]
}

export const PLAN_CAPABILITY_GROUPS: readonly PlanCapabilityGroup[] = [
  {
    key: "core",
    label: "Ядро платформы",
    description: "Базовая работа SaaS: здания, арендаторы, поиск и кабинет.",
    capabilities: [
      {
        key: "multiBuilding",
        label: "Несколько зданий",
        description: "Организация может вести несколько объектов и смотреть общую картину.",
        group: "core",
        recommended: true,
      },
      {
        key: "tenantCabinet",
        label: "Кабинет арендатора",
        description: "Арендаторы видят долг, документы, заявки, оплату и историю.",
        group: "core",
        recommended: true,
      },
      {
        key: "cmdkSearch",
        label: "Глобальный поиск Ctrl+K",
        description: "Быстрый поиск по арендаторам, документам, зданиям и действиям.",
        group: "core",
      },
      {
        key: "addressAutocomplete",
        label: "Подсказки адресов РК",
        description: "Автоподбор адреса для зданий, организаций и арендаторов.",
        group: "core",
      },
      {
        key: "roleBuilder",
        label: "Конструктор должностей",
        description: "Владелец сможет сам настраивать должности и права команды.",
        group: "core",
        risk: "business",
      },
    ],
  },
  {
    key: "objects",
    label: "Объекты и помещения",
    description: "Планировки, помещения, лиды и контроль качества данных.",
    capabilities: [
      {
        key: "floorEditor",
        label: "Графический редактор плана",
        description: "Визуальное создание и редактирование помещений на плане этажа.",
        group: "objects",
        recommended: true,
      },
      {
        key: "publicBooking",
        label: "Публичная витрина свободных помещений",
        description: "Страница для заявок от потенциальных арендаторов.",
        group: "objects",
      },
      {
        key: "leadsPipeline",
        label: "Лиды и бронирование",
        description: "Воронка заявок, бронь помещения и перевод лида в арендатора.",
        group: "objects",
      },
      {
        key: "dataQuality",
        label: "Центр качества данных",
        description: "Поиск проблем: нет реквизитов, нет помещения, двойные ставки, пустые контакты.",
        group: "objects",
        recommended: true,
      },
    ],
  },
  {
    key: "documents",
    label: "Документы и подписи",
    description: "Договоры, шаблоны, доп. соглашения, хранение и подпись.",
    capabilities: [
      {
        key: "contractTemplates",
        label: "Шаблоны договоров",
        description: "DOCX/XLSX/PDF-шаблоны с подстановкой данных арендатора и владельца.",
        group: "documents",
        recommended: true,
      },
      {
        key: "documentTemplates",
        label: "Свои шаблоны документов",
        description: "Отдельные шаблоны для договоров, счетов, АВР и актов сверки.",
        group: "documents",
        recommended: true,
      },
      {
        key: "addendums",
        label: "Дополнительные соглашения",
        description: "Черновики из договора, подпись и применение изменений только после SIGNED.",
        group: "documents",
        risk: "business",
      },
      {
        key: "ncalayerSigning",
        label: "Подписание NCALayer",
        description: "Электронная подпись документов арендатором и арендодателем.",
        group: "documents",
        risk: "business",
      },
      {
        key: "storage",
        label: "DB-хранилище файлов",
        description: "Хранение договоров, чеков, вложений заявок и файлов организации.",
        group: "documents",
        recommended: true,
      },
      {
        key: "bulkDocuments",
        label: "Массовые документы",
        description: "Пакетное создание или скачивание документов.",
        group: "documents",
      },
    ],
  },
  {
    key: "finance",
    label: "Финансы",
    description: "Начисления, оплаты, отчеты, касса, банк и экспорт.",
    capabilities: [
      {
        key: "invoices",
        label: "Счета и начисления",
        description: "Создание счетов, начислений, долгов и закрытие оплатой.",
        group: "finance",
        recommended: true,
      },
      {
        key: "paymentReports",
        label: "Чеки арендатора",
        description: "Арендатор отправляет чек, администратор подтверждает или отклоняет.",
        group: "finance",
        recommended: true,
      },
      {
        key: "cashPayments",
        label: "Наличная оплата",
        description: "Прием наличных с обязательным подтверждением администратором.",
        group: "finance",
      },
      {
        key: "cashAccounting",
        label: "Касса и счета организации",
        description: "Учет денег по банковским счетам, кассе и внутренним транзакциям.",
        group: "finance",
        risk: "business",
      },
      {
        key: "bankImport",
        label: "Импорт банковской выписки",
        description: "Загрузка выписок для сверки платежей.",
        group: "finance",
      },
      {
        key: "excelExport",
        label: "Excel-экспорт",
        description: "Выгрузка таблиц и отчетов в Excel.",
        group: "finance",
      },
      {
        key: "ownerReports",
        label: "Отчеты владельца PDF/Excel",
        description: "P&L, долги, доходность, заполняемость и сравнение зданий.",
        group: "finance",
        recommended: true,
      },
      {
        key: "export1c",
        label: "Экспорт 1С",
        description: "Подготовка данных для бухгалтерского учета.",
        group: "finance",
      },
    ],
  },
  {
    key: "operations",
    label: "Операционная работа",
    description: "Заявки, задачи, счетчики, уведомления и напоминания.",
    capabilities: [
      {
        key: "requests",
        label: "Заявки арендаторов",
        description: "Обращения арендаторов с комментариями, статусами и файлами.",
        group: "operations",
        recommended: true,
      },
      {
        key: "tasks",
        label: "Задачи команды",
        description: "Назначение задач администраторам, техникам и менеджерам.",
        group: "operations",
      },
      {
        key: "meters",
        label: "Счетчики и коммунальные услуги",
        description: "Показания, расход, тарифы и начисления по коммунальным платежам.",
        group: "operations",
      },
      {
        key: "autoReminders",
        label: "Автонапоминания",
        description: "Уведомления о долгах, сроках оплаты, договорах и заявках.",
        group: "operations",
        recommended: true,
      },
      {
        key: "emailNotifications",
        label: "Email-уведомления",
        description: "Отправка писем арендаторам и пользователям организации.",
        group: "operations",
      },
      {
        key: "telegramBot",
        label: "Telegram-бот",
        description: "Оповещения и действия через Telegram.",
        group: "operations",
      },
    ],
  },
  {
    key: "platform",
    label: "Расширения и поддержка",
    description: "API, домены, white label, AI, мониторинг и приоритетная поддержка.",
    capabilities: [
      {
        key: "api",
        label: "Public API",
        description: "Интеграции с внешними системами через API-ключи.",
        group: "platform",
        risk: "business",
      },
      {
        key: "customDomain",
        label: "Свой домен",
        description: "Подключение клиентского домена вместо стандартного поддомена.",
        group: "platform",
      },
      {
        key: "whiteLabel",
        label: "White label",
        description: "Брендинг клиента без явного упоминания платформы.",
        group: "platform",
      },
      {
        key: "webVitals",
        label: "Core Web Vitals",
        description: "Сбор LCP, INP, CLS и маршрутов для анализа скорости.",
        group: "platform",
      },
      {
        key: "supportMode",
        label: "Support Mode",
        description: "Расширенная диагностика организации для поддержки SaaS.",
        group: "platform",
        risk: "sensitive",
      },
      {
        key: "aiAssistant",
        label: "AI-ассистент",
        description: "AI-помощник для документов, проверок и анализа данных.",
        group: "platform",
      },
      {
        key: "prioritySupport",
        label: "Приоритетная поддержка",
        description: "Быстрые ответы, помощь с настройкой и сопровождение.",
        group: "platform",
      },
    ],
  },
] as const

export const PLAN_CAPABILITIES: readonly PlanCapability[] = PLAN_CAPABILITY_GROUPS.flatMap((group) => group.capabilities)
export type PlanCapabilityKey = string
export const PLAN_CAPABILITY_KEYS = PLAN_CAPABILITIES.map((capability) => capability.key)

export type PlanUsageLimit = {
  key: string
  label: string
  unit: string
  description: string
}

export const PLAN_USAGE_LIMITS: readonly PlanUsageLimit[] = [
  {
    key: "storageGb",
    label: "Хранилище",
    unit: "ГБ",
    description: "Общий объем файлов организации: договоры, чеки, вложения и шаблоны.",
  },
  {
    key: "documentsPerMonth",
    label: "Документы в месяц",
    unit: "шт.",
    description: "Сколько документов можно формировать за календарный месяц.",
  },
  {
    key: "apiRequestsPerMonth",
    label: "API-запросы в месяц",
    unit: "запр.",
    description: "Лимит обращений к публичному API.",
  },
  {
    key: "supportSlaHours",
    label: "SLA поддержки",
    unit: "час.",
    description: "Целевое время первой реакции поддержки.",
  },
] as const

export type PlanUsageLimitKey = string

export type ParsedPlanFeatures = {
  flags: Record<string, boolean>
  limits: Record<string, number | null>
  highlights: string[]
}

export function parsePlanFeatures(features: string | null | undefined): ParsedPlanFeatures {
  const parsed = parseJsonObject(features)
  const flags = Object.fromEntries(
    PLAN_CAPABILITY_KEYS.map((key) => [key, parsed[key] === true]),
  ) as Record<string, boolean>

  const rawLimits = isRecord(parsed.limits) ? parsed.limits : {}
  const limits = Object.fromEntries(
    PLAN_USAGE_LIMITS.map((limit) => [limit.key, normalizeNumberOrNull(rawLimits[limit.key])]),
  ) as Record<string, number | null>

  const highlights = Array.isArray(parsed.highlights)
    ? parsed.highlights
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 8)
    : []

  return { flags, limits, highlights }
}

export function enabledPlanCapabilityCount(features: string | null | undefined) {
  const parsed = parsePlanFeatures(features)
  return PLAN_CAPABILITY_KEYS.filter((key) => parsed.flags[key]).length
}

export function annualDiscountPercent(priceMonthly: number, priceYearly: number) {
  if (priceMonthly <= 0 || priceYearly <= 0) return 0
  const fullYear = priceMonthly * 12
  if (priceYearly >= fullYear) return 0
  return Math.round((1 - priceYearly / fullYear) * 100)
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  return Number.isFinite(number) && number >= 0 ? number : null
}
