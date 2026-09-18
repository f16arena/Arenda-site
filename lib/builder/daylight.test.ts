import { describe, expect, it } from "vitest"
import { clampHour, daylight, hourLabel } from "./daylight"

describe("daylight", () => {
  it("в полдень солнце выше всего, на рассвете и закате — низко", () => {
    const noon = daylight(13)
    const dawn = daylight(7)
    const dusk = daylight(19)
    expect(-noon.dir.y).toBeGreaterThan(-dawn.dir.y)
    expect(-noon.dir.y).toBeGreaterThan(-dusk.dir.y)
  })

  it("утром светит с востока, вечером с запада", () => {
    // солнце на востоке → лучи идут на запад: x отрицательный при азимуте 90°
    const morning = daylight(8)
    const evening = daylight(18)
    expect(Math.sign(morning.dir.x)).not.toBe(Math.sign(evening.dir.x))
  })

  it("направление — единичный вектор", () => {
    for (const h of [5, 8, 12, 16, 21]) {
      const d = daylight(h)
      expect(Math.hypot(d.dir.x, d.dir.y, d.dir.z)).toBeCloseTo(1, 5)
    }
  })

  it("вечером свет теплее, чем днём", () => {
    const warm = daylight(19).sunColor
    const day = daylight(13).sunColor
    const red = (c: string) => parseInt(c.slice(1, 3), 16) - parseInt(c.slice(5, 7), 16)
    expect(red(warm)).toBeGreaterThan(red(day))
  })

  it("ночью солнце под горизонтом и света мало", () => {
    const night = daylight(21)
    expect(night.daytime).toBe(false)
    expect(night.sun).toBeLessThan(0.5)
  })

  it("цвета — валидные hex", () => {
    const d = daylight(11.5)
    for (const c of [d.sunColor, d.skyColor, d.fog, ...d.sky]) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it("час ограничивается рабочим диапазоном", () => {
    expect(clampHour(2)).toBe(5)
    expect(clampHour(23)).toBe(21)
  })

  it("подпись времени с ведущими нулями", () => {
    expect(hourLabel(9)).toBe("09:00")
    expect(hourLabel(14.5)).toBe("14:30")
  })

  it("значения меняются плавно, без скачков", () => {
    let prev = daylight(5)
    for (let h = 5.25; h <= 21; h += 0.25) {
      const cur = daylight(h)
      expect(Math.abs(cur.sun - prev.sun)).toBeLessThan(0.35)
      prev = cur
    }
  })
})
