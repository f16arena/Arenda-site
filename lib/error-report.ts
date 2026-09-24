import type { Messages } from "@/lib/i18n/messages"
import type { Translator } from "@/lib/i18n/translate"

/** Переводчик страницы: const { t } = await getT() или useT(). */
type RefsTranslator = Translator<Messages>["t"]

export type ErrorReportDetails = {
  errorId?: string | null
  source?: string | null
  path?: string | null
  href?: string | null
  message?: string | null
  digest?: string | null
  stack?: string | null
  sentryEventId?: string | null
  userAgent?: string | null
  referrer?: string | null
  userId?: string | null
  userRole?: string | null
  organizationId?: string | null
  method?: string | null
  host?: string | null
  routeKind?: string | null
  at?: string | null
  explanation?: string | null
  suggestedAction?: string | null
  hints?: string[]
  context?: Record<string, unknown> | null
  supportStatus?: "NEW" | "IN_PROGRESS" | "RESOLVED" | null
  supportNote?: string | null
  supportUpdatedAt?: string | null
  supportUpdatedBy?: string | null
  supportResolvedAt?: string | null
}

export type ErrorReportDecode = {
  title: string
  severity: "critical" | "warning" | "info"
  explanation: string
  suggestedAction: string
  hints: string[]
}

/**
 * Классификация ошибки для журнала. Текст остаётся русским осознанно: этот
 * разбор пишется в audit_logs при приёме отчёта (app/api/errors/report) и
 * хранится там как исторический след, а читают его lib/action-error.ts и
 * lib/server-fallback.ts, где переводчика нет. Перевод поздних записей всё
 * равно не изменил бы уже сохранённые. Для интерфейса «Ошибки сайта» текст на
 * языке пользователя собирает humanizeErrorReport ниже.
 */
export function decodeErrorReport(input: {
  source?: string | null
  path?: string | null
  message?: string | null
  digest?: string | null
  stack?: string | null
  href?: string | null
}): ErrorReportDecode {
  const source = input.source ?? ""
  const path = input.path ?? ""
  const message = input.message ?? ""
  const stack = input.stack ?? ""
  const digest = input.digest ?? ""
  const text = `${source}\n${path}\n${message}\n${stack}\n${digest}`.toLowerCase()

  if (text.includes("minified react error #418") || text.includes("react.dev/errors/418")) {
    return {
      title: "React hydration/render mismatch",
      severity: "info",
      explanation:
        "React сообщил, что HTML с сервера и итоговая разметка в браузере не совпали. Обычно это ошибка отрисовки, а не повреждение данных.",
      suggestedAction:
        "Проверьте страницу на разные значения server/client: даты без фиксированного timeZone, случайные значения, window/localStorage до mount, невалидную HTML-разметку и расширения браузера.",
      hints: [
        "Если повторяется у всех пользователей, ищите компонент с разным server/client render.",
        "Если повторяется только у одного пользователя, проверьте браузерные расширения и приватный режим.",
      ],
    }
  }

  if (text.includes("server components render") || (digest && source.includes("/error"))) {
    return {
      title: "Server Components render error",
      severity: "critical",
      explanation:
        "Next.js в production скрывает реальный текст серверной ошибки, чтобы не раскрывать секреты. Код ошибки и digest связывают экран пользователя с записью в серверных логах.",
      suggestedAction:
        "Откройте эту запись, посмотрите страницу, пользователя, организацию и digest, затем найдите тот же digest или errorId в логах Vercel/сервере около времени события.",
      hints: [
        "Чаще всего причина в Prisma-запросе, отсутствующей переменной окружения, неверном org/building scope или ошибке в Server Component.",
        "Если ошибка повторяется на одной странице, сначала проверьте последние изменения этой страницы и ее server actions.",
      ],
    }
  }

  if (text.includes("next_redirect") || text.includes("redirect")) {
    return {
      title: "Unexpected redirect",
      severity: "warning",
      explanation:
        "Компонент или action вызвал redirect в неожиданном месте. Пользователь мог попасть на неправильный домен или раздел.",
      suggestedAction:
        "Проверьте middleware/proxy, app/page.tsx, login redirect и роль пользователя. Для root-домена commrent.kz не должно быть автоматического перехода в org-кабинет.",
      hints: ["Сравните host, path и роль пользователя в этой записи."],
    }
  }

  if (text.includes("failed to fetch") || text.includes("networkerror") || text.includes("load failed")) {
    return {
      title: "Client network/API error",
      severity: "warning",
      explanation:
        "Браузер не смог выполнить запрос к API или загрузить ресурс. Это может быть сеть, CORS, редирект HTML вместо JSON или падение API route.",
      suggestedAction:
        "Проверьте href, referrer, Network tab и серверный лог API route за это же время.",
      hints: ["Если API вернул HTML, middleware мог перенаправить fetch-запрос на /login."],
    }
  }

  if (text.includes("server-action") || source.includes(".") && !source.includes("/")) {
    return {
      title: "Server action failed",
      severity: "warning",
      explanation:
        "Ошибка произошла во время сохранения формы или выполнения действия на сервере. Пользователь должен увидеть понятное сообщение, а разработчик — источник action, страницу, пользователя, организацию и контекст.",
      suggestedAction:
        "Откройте stack trace и context. Если это validation error — улучшите текст в форме; если Prisma/database error — проверьте scope, миграции, обязательные поля и уникальные ограничения.",
      hints: [
        "Если ошибка повторяется только у одной организации, сравните данные этой организации с рабочей.",
        "Если в stack есть Prisma, сначала проверьте схему, миграции и реальные значения foreign key/unique fields.",
      ],
    }
  }

  if (text.includes("prisma") || text.includes("unique constraint") || text.includes("foreign key constraint")) {
    return {
      title: "Database / Prisma error",
      severity: "critical",
      explanation:
        "Серверный код получил ошибку базы данных. Обычно причина в миграции, обязательном поле, неверной связи, дубликате уникального значения или нарушении scope между организациями/зданиями.",
      suggestedAction:
        "Проверьте stack trace, модель Prisma, миграции и данные записи. Если ошибка связана с tenant/building/org scope, добавьте явную проверку guard перед записью.",
      hints: [
        "Unique constraint означает, что запись с таким значением уже есть.",
        "Foreign key constraint означает, что связанная запись отсутствует или принадлежит другому scope.",
      ],
    }
  }

  if (text.includes("hydration") || text.includes("hydrating")) {
    return {
      title: "React hydration mismatch",
      severity: "warning",
      explanation:
        "HTML с сервера не совпал с клиентским React-рендером. Часто связано с датами, случайными значениями или чтением browser-only данных на сервере.",
      suggestedAction:
        "Проверьте компоненты страницы на Date.now(), Math.random(), window/localStorage и разные форматы дат server/client.",
      hints: ["Для browser-only значений используйте useEffect или клиентский компонент."],
    }
  }

  return {
    title: "Application error",
    severity: "info",
    explanation:
      "Система поймала ошибку в интерфейсе. Подробности смотрите в message, stack, странице, пользователе и контексте браузера.",
    suggestedAction:
      "Найдите страницу и действие пользователя, затем сопоставьте время события с серверными логами и последними изменениями.",
    hints: [],
  }
}

export function parseErrorDetails(raw: string | null | undefined): ErrorReportDetails {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as ErrorReportDetails
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return { message: raw.slice(0, 1_000) }
  }
}

export type HumanErrorSummary = {
  title: string
  problem: string
  cause: string
  action: string
  impact: string
  technicalKind: string
}

/**
 * Разбор ошибки человеческим языком для страницы «Ошибки сайта». Строки —
 * в словаре (superadmin.diag.*), здесь только выбор случая и подстановки.
 */
export function humanizeErrorReport(t: RefsTranslator, details: ErrorReportDetails): HumanErrorSummary {
  const path = details.path || t("superadmin.diag.unknownPage")
  const source = details.source || ""
  const message = details.message || ""
  const stack = details.stack || ""
  const text = `${source}
${path}
${message}
${stack}
${details.digest ?? ""}`.toLowerCase()
  const page = path.startsWith("/") ? path : t("superadmin.diag.pageLabel", { path })

  if (text.includes("minified react error #418") || text.includes("react.dev/errors/418")) {
    return {
      title: t("superadmin.diag.hydration.title", { page }),
      problem: t("superadmin.diag.hydration.problem"),
      cause: t("superadmin.diag.hydration.cause"),
      action: t("superadmin.diag.hydration.action"),
      impact: t("superadmin.diag.hydration.impact"),
      technicalKind: t("superadmin.diag.hydration.kind"),
    }
  }

  if (text.includes("server components render") || (details.digest && source.includes("/error"))) {
    return {
      title: t("superadmin.diag.serverComponent.title", { page }),
      problem: t("superadmin.diag.serverComponent.problem"),
      cause: t("superadmin.diag.serverComponent.cause"),
      action: t("superadmin.diag.serverComponent.action"),
      impact: t("superadmin.diag.serverComponent.impact"),
      technicalKind: t("superadmin.diag.serverComponent.kind"),
    }
  }

  const prismaInvocation = message.match(/Invalid `?prisma\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\(\)`? invocation/i)
  if (prismaInvocation || text.includes("prisma") || text.includes("unique constraint") || text.includes("foreign key constraint")) {
    const model = prismaInvocation?.[1]
    const operation = prismaInvocation?.[2]
    const subject = model && operation
      ? t("superadmin.diag.database.subjectKnown", { model, operation })
      : t("superadmin.diag.database.subjectUnknown")
    const isSchemaMismatch = text.includes("unknown argument") || text.includes("unknown field") || text.includes("invalid")
    return {
      title: t("superadmin.diag.database.title", { page }),
      problem: t("superadmin.diag.database.problem", { subject }),
      cause: isSchemaMismatch
        ? t("superadmin.diag.database.causeSchema")
        : t("superadmin.diag.database.cause"),
      action: t("superadmin.diag.database.action"),
      impact: t("superadmin.diag.database.impact"),
      technicalKind: t("superadmin.diag.database.kind"),
    }
  }

  if (text.includes("server-action") || (source.includes(".") && !source.includes("/"))) {
    return {
      title: t("superadmin.diag.serverAction.title", { page }),
      problem: t("superadmin.diag.serverAction.problem"),
      cause: t("superadmin.diag.serverAction.cause"),
      action: t("superadmin.diag.serverAction.action"),
      impact: t("superadmin.diag.serverAction.impact"),
      technicalKind: t("superadmin.diag.serverAction.kind"),
    }
  }

  if (text.includes("next_redirect") || text.includes("redirect")) {
    return {
      title: t("superadmin.diag.redirect.title", { page }),
      problem: t("superadmin.diag.redirect.problem"),
      cause: t("superadmin.diag.redirect.cause"),
      action: t("superadmin.diag.redirect.action"),
      impact: t("superadmin.diag.redirect.impact"),
      technicalKind: t("superadmin.diag.redirect.kind"),
    }
  }

  if (text.includes("failed to fetch") || text.includes("networkerror") || text.includes("load failed")) {
    return {
      title: t("superadmin.diag.network.title", { page }),
      problem: t("superadmin.diag.network.problem"),
      cause: t("superadmin.diag.network.cause"),
      action: t("superadmin.diag.network.action"),
      impact: t("superadmin.diag.network.impact"),
      technicalKind: t("superadmin.diag.network.kind"),
    }
  }

  return {
    title: t("superadmin.diag.unknown.title", { page }),
    problem: t("superadmin.diag.unknown.problem"),
    cause: t("superadmin.diag.unknown.cause"),
    action: t("superadmin.diag.unknown.action"),
    impact: t("superadmin.diag.unknown.impact"),
    technicalKind: t("superadmin.diag.unknown.kind"),
  }
}
