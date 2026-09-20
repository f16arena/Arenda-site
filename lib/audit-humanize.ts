/**
 * Запись журнала операций одной фразой: «Болат удалил арендатора „Satory“».
 *
 * В журнале лежат технические поля — action, entity, entityId и JSON с
 * деталями. Владельцу они ничего не говорят: раньше в таблице были колонки
 * «DELETE», «cmq9pos9s000» и сырой JSON. Здесь это превращается в обычное
 * предложение, а id и IP остаются только во второй, серой строке.
 */

export type AuditLogLike = {
  action: string
  entity: string
  entityId: string | null
  userName: string | null
  userRole: string | null
  details: string | null
  ip: string | null
  createdAt: Date | string
}

/** Кого/что затронули — в винительном падеже, чтобы фраза читалась. */
const ENTITY_ACCUSATIVE: Record<string, string> = {
  tenant: "арендатора",
  building: "здание",
  floor: "этаж",
  space: "помещение",
  charge: "начисление",
  payment: "платёж",
  expense: "расход",
  user: "пользователя",
  contract: "договор",
  document: "документ",
  lead: "лида",
  tariff: "тариф",
  meter: "счётчик",
  request: "заявку",
  task: "задачу",
  apiKey: "API-ключ",
  system: "систему",
}

const DOCUMENT_LABELS: Record<string, string> = {
  CONTRACT: "договор",
  ACT: "АВР",
  INVOICE: "счёт",
  RECONCILIATION: "акт сверки",
}

const VERBS: Record<string, string> = {
  CREATE: "создал",
  UPDATE: "изменил",
  DELETE: "удалил",
}

function parseDetails(details: string | null): Record<string, unknown> {
  if (!details) return {}
  try {
    const parsed = JSON.parse(details) as unknown
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Как называется объект в журнале — название компании, номер документа и т.п. */
function subjectName(entity: string, parsed: Record<string, unknown>): string | null {
  if (entity === "document") {
    const type = str(parsed.documentType)
    const number = str(parsed.number)
    const label = type ? DOCUMENT_LABELS[type] ?? type.toLowerCase() : "документ"
    const tenant = str(parsed.tenantName)
    const head = number ? `${label} №${number}` : label
    return tenant ? `${head} — ${tenant}` : head
  }
  return (
    str(parsed.companyName)
    ?? str(parsed.tenantName)
    ?? str(parsed.name)
    ?? str(parsed.title)
    ?? str(parsed.label)
    ?? str(parsed.email)
    ?? (str(parsed.number) ? `№${str(parsed.number)}` : null)
  )
}

/** Что именно изменили в правах — там свой словарь. */
function permissionSentence(who: string, parsed: Record<string, unknown>): string | null {
  const scope = str(parsed.scope)
  if (scope === "role_permission") {
    const section = str(parsed.section) ?? "раздел"
    const view = parsed.canView ? "видит" : "не видит"
    const edit = parsed.canEdit ? "может менять" : "менять не может"
    return `${who} настроил доступ к разделу «${section}»: ${view}, ${edit}`
  }
  if (scope === "role_capability") {
    const label = str(parsed.label) ?? str(parsed.capability) ?? "право"
    return `${who} ${parsed.enabled ? "включил" : "выключил"} право «${label}» для должности`
  }
  if (scope === "user_capability_override") {
    const label = str(parsed.label) ?? str(parsed.capability) ?? "право"
    const target = str(parsed.targetName) ?? "сотруднику"
    const mode = parsed.mode === "ALLOW" ? "разрешил лично" : parsed.mode === "DENY" ? "запретил лично" : "вернул по должности"
    return `${who} ${mode} «${label}» — ${target}`
  }
  if (scope === "role") {
    const label = str(parsed.label) ?? "должность"
    const source = str(parsed.sourceRole)
    return `${who} создал должность «${label}»${source ? ` (копия «${source}»)` : ""}`
  }
  return null
}

/** Одна фраза о том, что произошло. */
export function auditSentence(log: AuditLogLike): string {
  const parsed = parseDetails(log.details)
  const who = log.userName ?? "Система"

  if (log.action === "LOGIN") return `${who} вошёл в систему`
  if (log.action === "LOGOUT") return `${who} вышел из системы`
  if (log.action === "SECURITY") {
    return str(parsed.message) ?? `Событие безопасности: ${who}`
  }
  if (log.action === "ERROR") {
    return str(parsed.message) ?? str(parsed.path) ?? "Ошибка в работе системы"
  }

  const fromPermissions = permissionSentence(who, parsed)
  if (fromPermissions) return fromPermissions

  const verb = VERBS[log.action] ?? log.action.toLowerCase()
  const what = ENTITY_ACCUSATIVE[log.entity] ?? log.entity
  const name = subjectName(log.entity, parsed)
  return name ? `${who} ${verb} ${what} «${name}»` : `${who} ${verb} ${what}`
}

/** «сегодня в 18:54», «вчера в 08:42», «19 сент. в 08:42». */
export function auditWhen(value: Date | string, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((day(now) - day(date)) / 86_400_000)
  if (diffDays === 0) return `сегодня в ${time}`
  if (diffDays === 1) return `вчера в ${time}`
  const shown = date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  const withYear = date.getFullYear() === now.getFullYear()
    ? shown
    : `${shown} ${date.getFullYear()}`
  return `${withYear} в ${time}`
}

/** Серая вторая строка: должность, IP и id — для разбирательств. */
export function auditTrace(log: AuditLogLike): string {
  const parts: string[] = []
  if (log.userRole) parts.push(roleLabel(log.userRole))
  if (log.ip) parts.push(`IP ${log.ip}`)
  if (log.entityId) parts.push(`код ${log.entityId}`)
  return parts.join(" · ")
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "владелец",
  ADMIN: "администратор",
  MANAGER: "менеджер",
  ACCOUNTANT: "бухгалтер",
  TENANT: "арендатор",
  PLATFORM_OWNER: "платформа",
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.toLowerCase()
}
