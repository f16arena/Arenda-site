// Движок сборки (спецификация §7). Включает только активные секции/пункты,
// присваивает номера ДИНАМИЧЕСКИ (сквозная ренумерация — §16.2, выбор заказчика:
// удалённые блоки не оставляют дыр), фиксирует snapshot ID→номер для ДС.

import { type ContractState } from "./schema"
import { deriveContext, type DerivedContext } from "./derive"
import { validate, type ValidationResult } from "./validate"
import { buildClauses } from "./registry"

export interface AssembledChild {
  id: string
  num: string
  html: string
}

export interface AssembledItem {
  id: string
  num: string
  sub?: string
  html: string
  children: AssembledChild[]
}

export interface AssembledSection {
  num: number
  title: string
  items: AssembledItem[]
}

export interface AssemblyResult {
  sections: AssembledSection[]
  ctx: DerivedContext
  /** ID пункта → отображаемый номер на момент сборки (фиксируется при подписании) */
  snapshot: Record<string, string>
  /** номер раздела «Реквизиты и подписи» (последний, динамический) */
  requisitesNum: number
  validation: ValidationResult
}

/**
 * Собирает структуру договора из состояния. НЕ бросает на hard-ошибках —
 * возвращает их в validation, чтобы предпросмотр работал всегда; решение
 * блокировать генерацию принимает вызывающая сторона (assertGeneratable).
 */
export function assemble(s: ContractState): AssemblyResult {
  const ctx = deriveContext(s)
  const validation = validate(s, ctx)
  const secs = buildClauses(s, ctx)

  const sections: AssembledSection[] = []
  const snapshot: Record<string, string> = {}
  let secNum = 0

  for (const sec of secs) {
    if (sec.when && !sec.when()) continue
    secNum++
    const blocks = sec.blocks.filter((b) => !b.when || b.when())
    const items: AssembledItem[] = []
    let i = 0
    for (const b of blocks) {
      i++
      const num = `${secNum}.${i}`
      snapshot[b.id] = num
      const children: AssembledChild[] = []
      if (b.children) {
        const kids = b.children.filter((k) => !k.when || k.when())
        let j = 0
        for (const k of kids) {
          j++
          const kn = `${num}.${j}`
          snapshot[k.id] = kn
          children.push({ id: k.id, num: kn, html: k.html() })
        }
      }
      items.push({ id: b.id, num, sub: b.sub, html: b.html(), children })
    }
    sections.push({ num: secNum, title: sec.title, items })
  }

  return { sections, ctx, snapshot, requisitesNum: secNum + 1, validation }
}

/** Бросает, если есть hard-ошибки (использовать перед генерацией документа). */
export function assertGeneratable(result: AssemblyResult): void {
  if (result.validation.hard.length) {
    throw new Error("Договор содержит ошибки: " + result.validation.hard.join("; "))
  }
}
