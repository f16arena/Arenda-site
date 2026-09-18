import { describe, expect, it } from "vitest"
import { clientIp, shortAgent, viewsSummary, visitorHash } from "./share-log"

const headers = (map: Record<string, string>) => ({ get: (n: string) => map[n] ?? null })

describe("visitorHash", () => {
  it("один и тот же посетитель даёт один и тот же отпечаток", () => {
    expect(visitorHash("1.2.3.4", "tok")).toBe(visitorHash("1.2.3.4", "tok"))
  })

  it("адрес не восстановить и по разным ссылкам отпечатки разные", () => {
    const h = visitorHash("1.2.3.4", "tok")!
    expect(h).not.toContain("1.2.3.4")
    expect(h).not.toBe(visitorHash("1.2.3.4", "other"))
    expect(h).toHaveLength(16)
  })

  it("без адреса отпечатка нет", () => {
    expect(visitorHash(null, "tok")).toBeNull()
  })
})

describe("clientIp", () => {
  it("берёт первый адрес из цепочки прокси", () => {
    expect(clientIp(headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9")
  })

  it("запасной заголовок", () => {
    expect(clientIp(headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8")
  })

  it("без заголовков — null", () => {
    expect(clientIp(headers({}))).toBeNull()
  })
})

describe("shortAgent", () => {
  it("узнаёт браузер и систему", () => {
    expect(shortAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36")).toBe("Chrome · Windows")
  })

  it("телефон помечается", () => {
    expect(shortAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1 Mobile")).toContain("телефон")
  })

  it("без UA — null", () => {
    expect(shortAgent(null)).toBeNull()
  })
})

describe("viewsSummary", () => {
  it("без открытий", () => {
    expect(viewsSummary(0, null)).toBe("ещё не открывали")
  })

  it("склонение по числу", () => {
    expect(viewsSummary(1, null)).toContain("1 открытие")
    expect(viewsSummary(3, null)).toContain("3 открытия")
    expect(viewsSummary(11, null)).toContain("11 открытий")
    expect(viewsSummary(22, null)).toContain("22 открытия")
  })

  it("показывает время последнего открытия", () => {
    const s = viewsSummary(2, new Date("2026-09-18T14:22:00"))
    expect(s).toMatch(/последнее 18\.09 в \d{2}:\d{2}/)
  })
})
