import { describe, expect, it } from "vitest"
import { createTranslator, plural } from "./translate"
import { formatDateL, formatPeriodL, formatMoneyL } from "./format"
import { ru, kk } from "./messages"

const sample = {
  docs: {
    title: "Документы",
    greeting: "Здравствуйте, {name}!",
    count: plural({ one: "{count} договор", few: "{count} договора", many: "{count} договоров", other: "{count} договора" }),
  },
}

const sampleKk = {
  docs: {
    title: "Құжаттар",
    greeting: "Сәлеметсіз бе, {name}!",
    // Казахское число с формой не согласуется: «1 шарт», «5 шарт».
    count: plural({ one: "{count} шарт", other: "{count} шарт" }),
  },
}

describe("перевод", () => {
  it("берёт строку по ключу и подставляет значения", () => {
    const { t } = createTranslator("kk", sampleKk)
    expect(t("docs.title")).toBe("Құжаттар")
    expect(t("docs.greeting", { name: "Болат" })).toBe("Сәлеметсіз бе, Болат!")
  })

  it("склоняет по-русски в три формы", () => {
    const { tp } = createTranslator("ru", sample)
    expect(tp("docs.count", 1)).toBe("1 договор")
    expect(tp("docs.count", 3)).toBe("3 договора")
    expect(tp("docs.count", 5)).toBe("5 договоров")
    expect(tp("docs.count", 21)).toBe("21 договор")
  })

  it("по-казахски число форму не меняет", () => {
    const { tp } = createTranslator("kk", sampleKk)
    expect(tp("docs.count", 1)).toBe("1 шарт")
    expect(tp("docs.count", 5)).toBe("5 шарт")
  })

  it("если строки нет — показывает русскую, а не ключ", () => {
    const { t } = createTranslator("kk", { docs: {} }, sample)
    expect(t("docs.title" as never)).toBe("Документы")
  })

  it("если строки нет нигде — возвращает ключ, а не падает", () => {
    const { t } = createTranslator("kk", {})
    expect(t("nope.missing" as never)).toBe("nope.missing")
  })
})

describe("словари", () => {
  // Типы уже требуют те же ключи, но пустую строку компилятор пропустит.
  it("в казахском нет пустых строк", () => {
    const empty: string[] = []
    const walk = (node: unknown, path: string) => {
      if (typeof node === "string") {
        if (!node.trim()) empty.push(path)
        return
      }
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k)
      }
    }
    walk(kk, "")
    expect(empty).toEqual([])
  })

  it("казахский повторяет все разделы русского", () => {
    expect(Object.keys(kk).sort()).toEqual(Object.keys(ru).sort())
  })
})

describe("даты и деньги", () => {
  const d = new Date(2026, 8, 22)

  it("казахская дата — год впереди, месяц по-казахски", () => {
    expect(formatDateL("kk", d)).toBe("2026 ж. 22 қыркүйек")
    expect(formatDateL("ru", d)).toBe("22 сентября 2026 г.")
  })

  it("месяц начисления с заглавной", () => {
    expect(formatPeriodL("ru", "2026-09")).toBe("Сентябрь 2026 г.")
    expect(formatPeriodL("kk", "2026-09")).toBe("2026 ж. қыркүйек")
  })

  it("деньги в тенге", () => {
    // Intl ставит неразрывные пробелы — сравниваем без них.
    expect(formatMoneyL("kk", 120000).replace(/\s/g, " ")).toBe("120 000 ₸")
  })
})
