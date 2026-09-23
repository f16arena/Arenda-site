import { describe, expect, it } from "vitest"
import { lastViewAt, shortAgent } from "./share-log"
import { clientIp, visitorHash } from "./share-log-server"

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

describe("lastViewAt", () => {
  it("без даты — пусто", () => {
    expect(lastViewAt("ru-RU", null)).toBe("")
  })

  it("день, месяц и время", () => {
    expect(lastViewAt("ru-RU", new Date("2026-09-18T14:22:00"))).toMatch(/^18\.09 \d{2}:\d{2}$/)
  })
})
