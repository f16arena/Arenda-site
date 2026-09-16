// Сторож изоляции между зданиями.
//
// В проекте два уровня доступа: организация и конкретное здание. Орг-скоуп
// (buildingScope/floorScope) не защищает от соседнего здания внутри той же
// организации — для этого есть assertBuildingAccess. Забыть его легко:
// страница выглядит рабочей, а сотрудник одного объекта видит чужой.
//
// Тест статический: он читает исходники и требует вызов сторожа в каждой
// точке входа, адресующей конкретное здание или этаж. Базы не нужно,
// поэтому он гоняется на каждом прогоне и не даёт дыре вернуться.

import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()

function walk(dir: string, matcher: RegExp): string[] {
  const absolute = path.join(ROOT, dir)
  let entries: string[]
  try {
    entries = readdirSync(absolute)
  } catch {
    return []
  }
  const found: string[] = []
  for (const entry of entries) {
    const relative = path.join(dir, entry)
    if (statSync(path.join(ROOT, relative)).isDirectory()) {
      found.push(...walk(relative, matcher))
    } else if (matcher.test(entry)) {
      found.push(relative)
    }
  }
  return found
}

function guarded(file: string): boolean {
  return readFileSync(path.join(ROOT, file), "utf8").includes("assertBuildingAccess")
}

describe("изоляция между зданиями", () => {
  it("каждая страница конкретного здания проверяет доступ к нему", () => {
    const pages = walk("app/admin/buildings/[id]", /^page\.tsx$/)
    expect(pages.length).toBeGreaterThan(0)
    expect(pages.filter((file) => !guarded(file))).toEqual([])
  })

  it("каждый API по конкретному зданию проверяет доступ к нему", () => {
    const routes = walk("app/api/admin/buildings/[id]", /^route\.ts$/)
    expect(routes.length).toBeGreaterThan(0)
    expect(routes.filter((file) => !guarded(file))).toEqual([])
  })

  it("каждый API по конкретному этажу проверяет доступ к его зданию", () => {
    // Таких маршрутов может не быть вовсе — важно, чтобы у появившихся был сторож
    const routes = walk("app/api/admin/floors/[id]", /^route\.ts$/)
    expect(routes.filter((file) => !guarded(file))).toEqual([])
  })

  it("действия конструктора проверяют доступ к зданию", () => {
    const actions = ["app/actions/indoor-map.ts", "app/actions/floor-layout.ts"]
    expect(actions.filter((file) => !guarded(file))).toEqual([])
  })

  it("список 3D-объектов режется по доступным зданиям, а не по организации", () => {
    const source = readFileSync(path.join(ROOT, "app/admin/builder/projects/page.tsx"), "utf8")
    expect(source).toContain("getAccessibleBuildingIdsForSession")
  })
})
