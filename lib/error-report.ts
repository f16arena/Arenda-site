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

export type HumanErrorSummary = {
  title: string
  problem: string
  cause: string
  action: string
  impact: string
  technicalKind: string
}

export function humanizeErrorReport(details: ErrorReportDetails): HumanErrorSummary {
  const path = details.path || "неизвестная страница"
  const source = details.source || ""
  const message = details.message || ""
  const stack = details.stack || ""
  const text = `${source}\n${path}\n${message}\n${stack}\n${details.digest ?? ""}`.toLowerCase()
  const pageLabel = path.startsWith("/") ? path : `страница ${path}`

  if (text.includes("minified react error #418") || text.includes("react.dev/errors/418")) {
    return {
      title: `На странице ${pageLabel} сломалась отрисовка интерфейса`,
      problem: "Браузер получил ошибку React #418. Пользователь мог увидеть белый экран, сломанную страницу или сообщение об ошибке.",
      cause: "Чаще всего сервер отдал один HTML, а браузер попытался собрать другой. Проверьте компоненты страницы: даты, случайные значения, данные из window/localStorage и некорректную HTML-разметку.",
      action: "Откройте страницу, повторите действие пользователя и проверьте последний релиз. Если ошибка повторяется, исправьте компонент, который по-разному рендерится на сервере и в браузере.",
      impact: "Это клиентская ошибка интерфейса: данные обычно не повреждаются, но пользователь не может нормально работать на этой странице.",
      technicalKind: "React hydration/render",
    }
  }

  if (text.includes("server components render") || (details.digest && source.includes("/error"))) {
    return {
      title: `Страница ${pageLabel} не открылась на сервере`,
      problem: "Next.js скрыл точную серверную ошибку в production, чтобы не показать секреты. Пользователь видит только код ошибки.",
      cause: "Обычно причина в Prisma-запросе, отсутствующей переменной окружения, несовпадении схемы базы данных или ошибке внутри server component.",
      action: "Найдите запись по коду ошибки или digest, откройте stack trace и проверьте запросы этой страницы. В первую очередь смотрите Prisma, scope организации/здания и обязательные поля.",
      impact: "Страница не работает для пользователя до исправления серверной причины.",
      technicalKind: "Next.js Server Component",
    }
  }

  const prismaInvocation = message.match(/Invalid `?prisma\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\(\)`? invocation/i)
  if (prismaInvocation || text.includes("prisma") || text.includes("unique constraint") || text.includes("foreign key constraint")) {
    const model = prismaInvocation?.[1]
    const operation = prismaInvocation?.[2]
    const subject = model && operation ? `Prisma ${model}.${operation}` : "Prisma-запрос"
    const isSchemaMismatch = text.includes("unknown argument") || text.includes("unknown field") || text.includes("invalid")
    return {
      title: `Ошибка базы данных на ${pageLabel}`,
      problem: `${subject} не выполнился. Пользовательский экран или действие получили ошибку вместо данных.`,
      cause: isSchemaMismatch
        ? "Код обращается к полю или связи, которых нет в текущей Prisma-схеме/клиенте. Часто это происходит после неполной миграции или когда в запрос добавили relation, но не добавили её в schema.prisma."
        : "База данных отклонила запрос: возможны неверная связь, дубль уникального значения, отсутствующая запись или нарушение scope между организациями/зданиями.",
      action: "Проверьте модель в schema.prisma, миграции и конкретный where/select из stack trace. После исправления запустите prisma generate, build и проверьте страницу повторно.",
      impact: "Данные не должны исчезнуть, но нужная страница или действие сейчас не завершается.",
      technicalKind: "Prisma / Database",
    }
  }

  if (text.includes("server-action") || (source.includes(".") && !source.includes("/"))) {
    return {
      title: `Действие пользователя на ${pageLabel} не выполнилось`,
      problem: "Пользователь нажал кнопку или отправил форму, но серверное действие завершилось ошибкой.",
      cause: "Возможны неверные данные формы, отсутствие прав, невалидная связь с организацией/зданием или ошибка записи в базе.",
      action: "Откройте контекст действия, проверьте пользователя, организацию, форму и stack trace. Если это ошибка ввода, покажите пользователю понятный текст прямо в форме.",
      impact: "Изменение не применилось, поэтому пользователю нужно повторить действие после исправления причины.",
      technicalKind: "Server action",
    }
  }

  if (text.includes("next_redirect") || text.includes("redirect")) {
    return {
      title: `Пользователя неожиданно перенаправило с ${pageLabel}`,
      problem: "Система выполнила redirect не там, где ожидалось.",
      cause: "Чаще всего причина в роли пользователя, subdomain routing, middleware/proxy или логике входа.",
      action: "Проверьте host, роль пользователя, текущую организацию и правила redirect для root-домена и поддоменов.",
      impact: "Пользователь может попасть не в тот кабинет или не увидеть нужную страницу.",
      technicalKind: "Redirect",
    }
  }

  if (text.includes("failed to fetch") || text.includes("networkerror") || text.includes("load failed")) {
    return {
      title: `Не загрузился запрос или файл на ${pageLabel}`,
      problem: "Браузер не смог получить ответ от API или загрузить ресурс.",
      cause: "Возможны сеть, неправильный URL, redirect вместо JSON, ошибка API route или блокировка доступа.",
      action: "Проверьте Network tab, URL запроса, статус ответа и серверный лог API за это же время.",
      impact: "Часть страницы может не загрузиться, но остальные данные обычно остаются целыми.",
      technicalKind: "Network / API",
    }
  }

  return {
    title: `Ошибка на ${pageLabel}`,
    problem: "Система поймала ошибку в интерфейсе или серверной операции.",
    cause: "Точная причина пока не распознана автоматически. Нужны страница, пользователь, время события и технические детали.",
    action: "Сначала повторите действие пользователя. Затем откройте техническое сообщение и stack trace, чтобы найти файл или запрос, где возникла ошибка.",
    impact: "Нужно проверить, мешает ли ошибка пользователю завершить действие.",
    technicalKind: "Application error",
  }
}
