/**
 * Запись журнала операций одной фразой: «Болат удалил арендатора „Satory“».
 *
 * В журнале лежат технические поля — action, entity, entityId и JSON с
 * деталями. Владельцу они ничего не говорят: раньше в таблице были колонки
 * «DELETE», «cmq9pos9s000» и сырой JSON. Здесь это превращается в обычное
 * предложение, а id и IP остаются только во второй, серой строке.
 *
 * Слова и порядок слов — из словаря (adminRefs.audit). Порядок у языков
 * разный: по-русски «Болат удалил арендатора», по-казахски «Болат жалға
 * алушыны жойды» — поэтому шаблон фразы целиком лежит в словаре, а здесь
 * только подстановка.
 */

import { INTL_LOCALE } from "@/lib/i18n/config"
import type { Messages } from "@/lib/i18n/messages"
import type { Translator } from "@/lib/i18n/translate"

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

/** Переводчик страницы журнала: const tr = await getT(). */
type AuditTranslator = Translator<Messages>

/** Строка словаря по собранному ключу; нет перевода — берём запасной текст. */
function refText(tr: AuditTranslator, key: string, fallback: string): string {
  const value = tr.t(key as Parameters<AuditTranslator["t"]>[0])
  return value === key ? fallback : value
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
function subjectName(tr: AuditTranslator, entity: string, parsed: Record<string, unknown>): string | null {
  if (entity === "document") {
    const type = str(parsed.documentType)
    const number = str(parsed.number)
    const label = type
      ? refText(tr, `adminRefs.audit.documentTypes.${type}`, type.toLowerCase())
      : tr.t("adminRefs.audit.documentFallback")
    const tenant = str(parsed.tenantName)
    const head = number ? tr.t("adminRefs.audit.documentNumbered", { label, number }) : label
    return tenant ? tr.t("adminRefs.audit.documentOfTenant", { document: head, tenant }) : head
  }
  const number = str(parsed.number)
  return (
    str(parsed.companyName)
    ?? str(parsed.tenantName)
    ?? str(parsed.name)
    ?? str(parsed.title)
    ?? str(parsed.label)
    ?? str(parsed.email)
    ?? (number ? tr.t("adminRefs.audit.numbered", { number }) : null)
  )
}

/**
 * Что именно изменили в правах — там свой словарь.
 *
 * Название права берём по КОДУ (details.capability), а не по сохранённой в
 * журнале подписи: подпись записана на языке того, кто менял права, а читать
 * журнал может другой человек. details.label остаётся запасным для старых
 * записей.
 */
function permissionSentence(tr: AuditTranslator, who: string, parsed: Record<string, unknown>): string | null {
  const scope = str(parsed.scope)
  const capabilityCode = str(parsed.capability)
  const capabilityLabel = capabilityCode
    ? refText(tr, `adminRefs.capabilities.${capabilityCode}.label`, str(parsed.label) ?? capabilityCode)
    : str(parsed.label) ?? tr.t("adminRefs.audit.permissions.rightFallback")

  if (scope === "role_permission") {
    const sectionCode = str(parsed.section)
    const section = sectionCode
      ? refText(tr, `adminRefs.sections.${sectionCode}`, sectionCode)
      : tr.t("adminRefs.audit.permissions.sectionFallback")
    return tr.t("adminRefs.audit.permissions.section", {
      who,
      section,
      view: parsed.canView
        ? tr.t("adminRefs.audit.permissions.sees")
        : tr.t("adminRefs.audit.permissions.notSees"),
      edit: parsed.canEdit
        ? tr.t("adminRefs.audit.permissions.edits")
        : tr.t("adminRefs.audit.permissions.notEdits"),
    })
  }
  if (scope === "role_capability") {
    return tr.t(
      parsed.enabled ? "adminRefs.audit.permissions.capabilityOn" : "adminRefs.audit.permissions.capabilityOff",
      { who, label: capabilityLabel },
    )
  }
  if (scope === "user_capability_override") {
    const target = str(parsed.targetName) ?? tr.t("adminRefs.audit.permissions.targetFallback")
    const key = parsed.mode === "ALLOW"
      ? "adminRefs.audit.permissions.overrideAllow"
      : parsed.mode === "DENY"
        ? "adminRefs.audit.permissions.overrideDeny"
        : "adminRefs.audit.permissions.overrideInherit"
    return tr.t(key, { who, label: capabilityLabel, target })
  }
  if (scope === "role") {
    const label = str(parsed.label) ?? tr.t("adminRefs.audit.permissions.roleFallback")
    const source = str(parsed.sourceRole)
    return source
      ? tr.t("adminRefs.audit.permissions.roleCopied", { who, label, source })
      : tr.t("adminRefs.audit.permissions.roleCreated", { who, label })
  }
  return null
}

/** Одна фраза о том, что произошло. */
export function auditSentence(log: AuditLogLike, tr: AuditTranslator): string {
  const parsed = parseDetails(log.details)
  const who = log.userName ?? tr.t("adminRefs.audit.system")

  if (log.action === "LOGIN") return tr.t("adminRefs.audit.login", { who })
  if (log.action === "LOGOUT") return tr.t("adminRefs.audit.logout", { who })
  if (log.action === "SECURITY") {
    return str(parsed.message) ?? tr.t("adminRefs.audit.security", { who })
  }
  if (log.action === "ERROR") {
    return str(parsed.message) ?? str(parsed.path) ?? tr.t("adminRefs.audit.error")
  }

  const fromPermissions = permissionSentence(tr, who, parsed)
  if (fromPermissions) return fromPermissions

  const verb = refText(tr, `adminRefs.audit.verbs.${log.action}`, log.action.toLowerCase())
  const what = refText(tr, `adminRefs.audit.entities.${log.entity}`, log.entity)
  const name = subjectName(tr, log.entity, parsed)
  return name
    ? tr.t("adminRefs.audit.sentenceNamed", { who, verb, what, name })
    : tr.t("adminRefs.audit.sentence", { who, verb, what })
}

/** «сегодня в 18:54», «вчера в 08:42», «19 сент. в 08:42». */
export function auditWhen(value: Date | string, tr: AuditTranslator, now: Date = new Date()): string {
  const intl = INTL_LOCALE[tr.locale]
  const date = value instanceof Date ? value : new Date(value)
  const time = date.toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit" })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((day(now) - day(date)) / 86_400_000)
  if (diffDays === 0) return tr.t("adminRefs.audit.when.today", { time })
  if (diffDays === 1) return tr.t("adminRefs.audit.when.yesterday", { time })
  const shown = date.toLocaleDateString(intl, { day: "numeric", month: "short" })
  const withYear = date.getFullYear() === now.getFullYear()
    ? shown
    : `${shown} ${date.getFullYear()}`
  return tr.t("adminRefs.audit.when.onDate", { date: withYear, time })
}

/** Серая вторая строка: должность, IP и id — для разбирательств. */
export function auditTrace(log: AuditLogLike, tr: AuditTranslator): string {
  const parts: string[] = []
  if (log.userRole) parts.push(roleLabel(log.userRole, tr))
  if (log.ip) parts.push(tr.t("adminRefs.audit.trace.ip", { ip: log.ip }))
  if (log.entityId) parts.push(tr.t("adminRefs.audit.trace.code", { code: log.entityId }))
  return parts.join(" · ")
}

/** Должность со строчной буквы — она идёт в серой строке журнала. */
export function roleLabel(role: string, tr: AuditTranslator): string {
  return refText(tr, `adminRefs.audit.roles.${role}`, role.toLowerCase())
}
