export type ErrorReportDetails = {
  errorId?: string | null
  source?: string | null
  path?: string | null
  href?: string | null
  message?: string | null
  digest?: string | null
  stack?: string | null
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
}

export type ErrorReportDecode = {
  title: string
  severity: "critical" | "warning" | "info"
  explanation: string
  suggestedAction: string
  hints: string[]
}

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
