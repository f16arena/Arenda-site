// ADR: Единый генератор идентификаторов сущностей документа. Префикс + счётчик
// + короткий случайный суффикс — читаемо в дебаге и уникально в рамках сессии.
// В рантайме приложения Math.random доступен (ограничение только в workflow-скриптах).

let counter = 0

export function uid(prefix: string): string {
  counter += 1
  return `${prefix}_${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
