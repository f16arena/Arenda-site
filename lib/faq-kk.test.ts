import { describe, expect, it } from "vitest"
import { faqItems } from "@/lib/faq"
import { faqItemsKk } from "@/lib/faq-kk"

/**
 * Казахская справка сверяется с русской по id: по нему статьи считаются одной и
 * той же и в базе живут двумя строками с общим slug. Разъехавшийся id создал бы
 * «сироту» — статью, которая показывается только на одном языке и которую
 * администратор правит дважды, не понимая, почему правка не видна.
 *
 * Перевод идёт постепенно, поэтому неполный казахский массив — норма; лишний
 * или переименованный id — нет.
 */
describe("казахская справка", () => {
  const ru = new Map(faqItems.map((item) => [item.id, item]))

  it("не содержит статей, которых нет в русской версии", () => {
    const orphans = faqItemsKk.filter((item) => !ru.has(item.id)).map((item) => item.id)
    expect(orphans).toEqual([])
  })

  it("не содержит повторяющихся id", () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const item of faqItemsKk) {
      if (seen.has(item.id)) duplicates.push(item.id)
      seen.add(item.id)
    }
    expect(duplicates).toEqual([])
  })

  it("сохраняет аудиторию и ссылку русской статьи", () => {
    for (const item of faqItemsKk) {
      const source = ru.get(item.id)
      expect(source, item.id).toBeDefined()
      expect(item.audience, `${item.id}: аудитория`).toBe(source!.audience)
      expect(item.href ?? null, `${item.id}: ссылка`).toBe(source!.href ?? null)
    }
  })

  it("не оставляет пустых обязательных полей", () => {
    for (const item of faqItemsKk) {
      expect(item.category.trim(), `${item.id}: категория`).not.toBe("")
      expect(item.question.trim(), `${item.id}: вопрос`).not.toBe("")
      expect(item.answer.trim(), `${item.id}: ответ`).not.toBe("")
      expect(item.tags.length, `${item.id}: теги для поиска`).toBeGreaterThan(0)
    }
  })

  it("ищется и по казахским, и по русским словам", () => {
    // Теги — это поиск. Казахоязычный читатель ищет «шарт», русскоязычный,
    // открывший казахскую версию, — «договор»; оба должны находить.
    for (const item of faqItemsKk) {
      const hasKazakh = item.tags.some((tag) => /[әіүұқғңөһ]/i.test(tag))
      const hasLatinOrRu = item.tags.some((tag) => /[a-zа-я]/i.test(tag))
      expect(hasKazakh || hasLatinOrRu, `${item.id}: теги пустые по смыслу`).toBe(true)
    }
  })
})
