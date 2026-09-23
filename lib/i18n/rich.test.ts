import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { RichText } from "./rich"

// Без JSX: vitest в этом проекте намеренно гоняет чистый TS (см. vitest.config).
const html = (template: string, vars?: Record<string, string>) =>
  renderToStaticMarkup(createElement(RichText, { template, vars }))

describe("RichText", () => {
  it("выделяет <b> и подставляет значения", () => {
    const out = html("Вы вошли как поддержка в <b>{org}</b>. Все действия записываются.", {
      org: "ТОО Ромашка",
    })
    expect(out).toContain("<b>ТОО Ромашка</b>")
    expect(out).toContain("Все действия записываются.")
  })

  // Главное, ради чего компонент и появился: название организации вводит
  // пользователь, и разметка в нём не должна становиться разметкой.
  it("не пускает разметку из подставляемого значения", () => {
    const out = html("Организация <b>{org}</b>.", { org: '<img src=x onerror="alert(1)">' })
    expect(out).not.toContain("<img")
    expect(out).toContain("&lt;img")
  })

  it("оставляет неизвестную подстановку как есть", () => {
    expect(html("Осталось {count} дн.")).toContain("Осталось {count} дн.")
  })

  it("незакрытый <b> не теряет текст", () => {
    expect(html("Подписка <b>истекла")).toContain("истекла")
  })

  it("работает без выделения и без значений", () => {
    expect(html("Нет уведомлений")).toContain("Нет уведомлений")
  })
})
