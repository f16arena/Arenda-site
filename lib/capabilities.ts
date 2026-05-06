import { auth } from "@/auth"
import { db } from "@/lib/db"
import { canEdit, canView, type Section } from "@/lib/acl"
import { parsePlanFeatures } from "@/lib/plan-capabilities"
import { requireOrgAccess } from "@/lib/org"
import { capabilityPermissionKey } from "@/lib/capability-keys"
import { redirect } from "next/navigation"

export {
  CAPABILITY_PERMISSION_PREFIX,
  capabilityKeyFromPermission,
  capabilityPermissionKey,
} from "@/lib/capability-keys"

export type CapabilityLevel = "view" | "edit" | "sensitive"
export type CapabilityRisk = "normal" | "business" | "sensitive"

export type ActionCapability = {
  key: string
  label: string
  description: string
  section: Section
  level: CapabilityLevel
  group: string
  requiredFeature?: string
  risk?: CapabilityRisk
}

export type ActionCapabilityGroup = {
  key: string
  label: string
  description: string
  capabilities: readonly ActionCapability[]
}

export const ACTION_CAPABILITY_GROUPS: readonly ActionCapabilityGroup[] = [
  {
    key: "access",
    label: "Пользователи и доступ",
    description: "Кто может приглашать людей, менять должности и управлять правами.",
    capabilities: [
      cap("users.invite", "Приглашать пользователей", "Создание нового пользователя внутри организации.", "users", "edit", "access", "roleBuilder"),
      cap("users.edit", "Редактировать пользователей", "Изменение контактов, роли и привязки к зданиям.", "users", "edit", "access", "roleBuilder"),
      cap("users.resetPassword", "Сбрасывать пароль", "Выдача нового пароля сотруднику или администратору.", "users", "sensitive", "access", "roleBuilder", "sensitive"),
      cap("users.deactivate", "Отключать пользователей", "Блокировка или повторная активация доступа.", "users", "sensitive", "access", "roleBuilder", "sensitive"),
      cap("users.delete", "Удалять пользователей", "Удаление профиля или деактивация связанного пользователя.", "users", "sensitive", "access", "roleBuilder", "sensitive"),
      cap("roles.create", "Создавать должности", "Добавление новой должности владельцем.", "roles", "sensitive", "access", "roleBuilder", "business"),
      cap("roles.editSections", "Менять доступ к разделам", "Включение страниц и права редактирования для должности.", "roles", "sensitive", "access", "roleBuilder", "business"),
      cap("roles.editActions", "Менять точные действия", "Включение отдельных кнопок и серверных действий.", "roles", "sensitive", "access", "roleBuilder", "business"),
      cap("roles.delete", "Удалять должности", "Удаление должности, если она никому не назначена.", "roles", "sensitive", "access", "roleBuilder", "business"),
    ],
  },
  {
    key: "objects",
    label: "Здания и помещения",
    description: "Создание объектов, этажей, помещений и привязка арендаторов.",
    capabilities: [
      cap("buildings.create", "Создавать здания", "Добавление нового объекта в портфель.", "buildings", "sensitive", "objects", "multiBuilding", "business"),
      cap("buildings.edit", "Редактировать здания", "Изменение адреса, контактов, ответственного и префиксов.", "buildings", "edit", "objects"),
      cap("buildings.toggle", "Включать и отключать здания", "Деактивация здания без удаления данных.", "buildings", "sensitive", "objects", "multiBuilding", "business"),
      cap("buildings.delete", "Удалять здания", "Удаление пустого здания без этажей и помещений.", "buildings", "sensitive", "objects", "multiBuilding", "sensitive"),
      cap("floors.create", "Создавать этажи", "Добавление этажа и базовой ставки.", "buildings", "edit", "objects"),
      cap("floors.delete", "Удалять этажи", "Удаление этажа с защитой от занятых помещений.", "buildings", "sensitive", "objects", undefined, "sensitive"),
      cap("spaces.edit", "Редактировать помещения", "Номер, площадь, статус и описание помещения.", "spaces", "edit", "objects"),
      cap("spaces.assignTenant", "Назначать арендатора в помещение", "Связь помещения с арендатором и статусом занятости.", "spaces", "sensitive", "objects", undefined, "business"),
      cap("spaces.delete", "Удалять помещения", "Удаление свободных помещений.", "spaces", "sensitive", "objects", undefined, "sensitive"),
      cap("leads.manage", "Вести лиды", "Создание и изменение заявок потенциальных арендаторов.", "tenants", "edit", "objects", "leadsPipeline"),
      cap("leads.bookSpace", "Бронировать помещение по лиду", "Временное удержание помещения под потенциального арендатора.", "spaces", "edit", "objects", "leadsPipeline"),
    ],
  },
  {
    key: "tenants",
    label: "Арендаторы",
    description: "Карточки арендаторов, контакты, условия аренды и привязки.",
    capabilities: [
      cap("tenants.create", "Создавать арендаторов", "Добавление нового арендатора.", "tenants", "edit", "tenants"),
      cap("tenants.editContacts", "Менять контакты арендатора", "ФИО, телефон, email и доступ в кабинет.", "tenants", "edit", "tenants"),
      cap("tenants.editCompany", "Менять данные компании", "Правовая форма, ИИН/БИН, адреса, руководитель и реквизиты.", "tenants", "edit", "tenants"),
      cap("tenants.editRentalTerms", "Менять условия аренды", "Ставка, фиксированная сумма, НДС, день оплаты и пеня.", "tenants", "sensitive", "tenants", undefined, "business"),
      cap("tenants.assignSpaces", "Привязывать помещения и этажи", "Несколько помещений, несколько этажей и аренда целого этажа.", "tenants", "sensitive", "tenants", undefined, "business"),
      cap("tenants.blacklist", "Добавлять в чёрный список", "Пометка проблемного арендатора.", "tenants", "sensitive", "tenants", undefined, "business"),
      cap("tenants.delete", "Удалять арендаторов", "Удаление карточки с проверкой долгов и документов.", "tenants", "sensitive", "tenants", undefined, "sensitive"),
    ],
  },
  {
    key: "finance",
    label: "Финансы",
    description: "Начисления, оплаты, касса, выписки и отчеты.",
    capabilities: [
      cap("finance.createInvoice", "Создавать счета и начисления", "Ручные начисления и ежемесячные счета.", "finances", "edit", "finance", "invoices"),
      cap("finance.recordPayment", "Вносить оплату", "Ручное внесение оплаты и закрытие начислений.", "finances", "sensitive", "finance", "invoices", "business"),
      cap("finance.confirmPayment", "Подтверждать чеки", "Подтверждение оплаты, отправленной арендатором.", "finances", "sensitive", "finance", "paymentReports", "business"),
      cap("finance.disputePayment", "Отправлять оплату в спор", "Пометка оплаты как спорной с причиной.", "finances", "sensitive", "finance", "paymentReports", "business"),
      cap("finance.rejectPayment", "Отклонять оплату", "Отклонение чека или заявленной оплаты.", "finances", "sensitive", "finance", "paymentReports", "business"),
      cap("finance.cashPayment", "Подтверждать наличные", "Наличная оплата с контролем администратора.", "finances", "sensitive", "finance", "cashPayments", "business"),
      cap("finance.manageCashAccounts", "Управлять счетами и кассой", "Банк, касса, карта, переводы и корректировки.", "finances", "sensitive", "finance", "cashAccounting", "business"),
      cap("finance.manageExpenses", "Вносить расходы", "Создание расходов здания и списание с денежных счетов.", "finances", "edit", "finance", "cashAccounting", "business"),
      cap("finance.importBank", "Импортировать выписку банка", "Загрузка банковской выписки и авто-матчинг платежей.", "finances", "edit", "finance", "bankImport"),
      cap("finance.manageTariffs", "Менять коммунальные тарифы", "Ставки за свет, воду, уборку и другие услуги.", "finances", "edit", "finance", "meters"),
      cap("finance.deleteRecords", "Удалять финансовые записи", "Удаление начислений, оплат и расходов.", "finances", "sensitive", "finance", undefined, "sensitive"),
      cap("finance.export", "Выгружать финансы", "Excel/PDF-выгрузки и отчеты владельца.", "analytics", "view", "finance", "ownerReports"),
    ],
  },
  {
    key: "documents",
    label: "Документы",
    description: "Шаблоны, договоры, счета, акты, подписи и хранилище.",
    capabilities: [
      cap("documents.create", "Создавать документы", "Договоры, счета, АВР и акты сверки.", "documents", "edit", "documents", "documentTemplates"),
      cap("documents.deleteUnsigned", "Удалять неподписанные документы", "Удаление ошибочного черновика или документа без подписи.", "documents", "edit", "documents"),
      cap("documents.deleteSigned", "Удалять подписанные документы", "Удаление подписанного документа только владельцем.", "documents", "sensitive", "documents", undefined, "sensitive"),
      cap("documents.uploadTemplate", "Загружать шаблоны", "Загрузка DOCX/XLSX/PDF-шаблонов организации.", "documents", "sensitive", "documents", "documentTemplates", "business"),
      cap("documents.generateBulk", "Массово формировать документы", "Пакетное создание документов.", "documents", "edit", "documents", "bulkDocuments"),
      cap("documents.sign", "Подписывать документы", "Запуск и контроль подписей NCALayer.", "contracts", "sensitive", "documents", "ncalayerSigning", "business"),
      cap("documents.addendum", "Создавать доп. соглашения", "Изменение условий только через документ-основание.", "contracts", "sensitive", "documents", "addendums", "business"),
      cap("storage.upload", "Загружать файлы", "Файлы организации, арендаторов, чеки и вложения.", "documents", "edit", "documents", "storage"),
      cap("storage.delete", "Удалять файлы", "Удаление файла из DB-хранилища с проверкой связей.", "documents", "sensitive", "documents", "storage", "sensitive"),
    ],
  },
  {
    key: "operations",
    label: "Операционная работа",
    description: "Заявки, задачи, счетчики, сообщения, FAQ и здоровье системы.",
    capabilities: [
      cap("requests.manage", "Обрабатывать заявки", "Статусы, комментарии и работа с обращениями арендаторов.", "requests", "edit", "operations", "requests"),
      cap("tasks.manage", "Управлять задачами", "Создание, назначение и закрытие задач.", "tasks", "edit", "operations", "tasks"),
      cap("meters.manage", "Управлять счетчиками", "Создание, показания, тарифы и удаление счетчиков.", "meters", "edit", "operations", "meters"),
      cap("messages.send", "Писать сообщения", "Коммуникация с арендаторами внутри системы.", "messages", "edit", "operations"),
      cap("complaints.manage", "Разбирать жалобы", "Статусы и ответы по жалобам.", "complaints", "edit", "operations"),
      cap("staff.manageSalary", "Начислять зарплаты", "Начисление и отметка выплат сотрудникам.", "staff", "sensitive", "operations", undefined, "sensitive"),
      cap("faq.manage", "Редактировать FAQ", "База инструкций для владельца, администратора и арендатора.", "settings", "edit", "operations"),
      cap("settings.updateOrganization", "Менять настройки организации", "Название, адрес, контакты, НДС и реквизиты.", "settings", "sensitive", "operations", undefined, "business"),
      cap("settings.updateBankDetails", "Менять банковские реквизиты", "Счета, БИК, ИИК и данные арендодателя.", "settings", "sensitive", "operations", undefined, "business"),
      cap("systemHealth.view", "Видеть проверку системы", "Health, guardrails, ошибки и качество данных.", "analytics", "view", "operations", "supportMode"),
    ],
  },
] as const

export const ACTION_CAPABILITIES: readonly ActionCapability[] = ACTION_CAPABILITY_GROUPS.flatMap((group) => group.capabilities)

export const ACTION_CAPABILITY_BY_KEY = new Map(ACTION_CAPABILITIES.map((capability) => [capability.key, capability]))

export type ActionCapabilityKey = (typeof ACTION_CAPABILITIES)[number]["key"] | string

export async function canPerformCapability(role: string, capabilityKey: string, isPlatformOwner = false) {
  if (role === "OWNER" || isPlatformOwner) return true
  const capability = ACTION_CAPABILITY_BY_KEY.get(capabilityKey)
  if (!capability) return false

  const explicit = await db.rolePermission.findUnique({
    where: { role_section: { role, section: capabilityPermissionKey(capabilityKey) } },
    select: { canView: true, canEdit: true },
  })
  if (explicit) return explicit.canView || explicit.canEdit

  return capability.level === "view"
    ? canView(role, capability.section)
    : canEdit(role, capability.section)
}

export async function requireCapability(capabilityKey: string) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const allowed = await canPerformCapability(
    session.user.role,
    capabilityKey,
    session.user.isPlatformOwner,
  )
  if (!allowed) {
    const capability = ACTION_CAPABILITY_BY_KEY.get(capabilityKey)
    throw new Error(`Нет права: ${capability?.label ?? capabilityKey}`)
  }

  return { id: session.user.id, role: session.user.role, isPlatformOwner: !!session.user.isPlatformOwner }
}

export async function requireCapabilityAndFeature(capabilityKey: string) {
  const session = await requireCapability(capabilityKey)
  const { orgId } = await requireOrgAccess()
  const capability = ACTION_CAPABILITY_BY_KEY.get(capabilityKey)
  if (capability?.requiredFeature) {
    await requireOrgFeature(orgId, capability.requiredFeature)
  }
  return { ...session, orgId }
}

export async function requireOrgFeature(orgId: string, featureKey: string) {
  const available = await isOrgFeatureAvailable(orgId, featureKey)
  if (!available) throw new Error(`Функция недоступна в текущем тарифе: ${featureKey}`)
}

export async function isOrgFeatureAvailable(orgId: string, featureKey: string) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: { select: { features: true } } },
  })
  return isFeatureAvailableInPlan(org?.plan?.features, featureKey)
}

export function isFeatureAvailableInPlan(features: string | null | undefined, featureKey: string) {
  if (!features) return true
  const raw = parseJsonObject(features)
  if (!Object.prototype.hasOwnProperty.call(raw, featureKey)) return true
  return parsePlanFeatures(features).flags[featureKey] === true
}

function cap(
  key: string,
  label: string,
  description: string,
  section: Section,
  level: CapabilityLevel,
  group: string,
  requiredFeature?: string,
  risk: CapabilityRisk = "normal",
): ActionCapability {
  return { key, label, description, section, level, group, requiredFeature, risk }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
