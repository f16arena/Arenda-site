import { describe, expect, it } from "vitest"
import { shareLinkValid } from "./share-link"

describe("ссылка-витрина", () => {
  const now = new Date("2026-09-18T10:00:00Z")
  it("действует, пока не отозвана и не истекла", () => {
    expect(shareLinkValid({ expiresAt: new Date("2026-10-18T10:00:00Z") }, now)).toBe(true)
    expect(shareLinkValid({ expiresAt: null }, now)).toBe(true)
  })
  it("отозванная и просроченная не открываются", () => {
    expect(shareLinkValid({ revokedAt: new Date(), expiresAt: new Date("2026-10-18T10:00:00Z") }, now)).toBe(false)
    expect(shareLinkValid({ expiresAt: new Date("2026-09-17T10:00:00Z") }, now)).toBe(false)
  })
  it("нет ссылки — нет доступа", () => {
    expect(shareLinkValid(null, now)).toBe(false)
    expect(shareLinkValid(undefined, now)).toBe(false)
  })
})
