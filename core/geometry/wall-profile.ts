// ADR: Профиль стены в плане — прямоугольник по толщине вокруг центральной линии.
// Фаза 1 — сплошные стены (квад → коробка по высоте). Проёмы (вырезы) — Фаза 2:
// API `wallProfile` уже принимает openings и режет ленту на под-сегменты, но пока
// массив пуст. Miter-стыки — улучшение Фазы 2 (сейчас прямые торцы).

import { type Vec2, add, normalize, perpLeft, scale, sub, distance } from "./math"

export interface WallQuad {
  // 4 угла footprint по часовой: левый старт, левый конец, правый конец, правый старт
  l1: Vec2
  l2: Vec2
  r2: Vec2
  r1: Vec2
}

export function wallQuad(a: Vec2, b: Vec2, thickness: number): WallQuad {
  const dir = normalize(sub(b, a))
  const n = scale(perpLeft(dir), thickness / 2)
  return {
    l1: add(a, n),
    l2: add(b, n),
    r2: sub(b, n),
    r1: sub(a, n),
  }
}

export interface WallOpening {
  offset: number // мм от начала стены до центра проёма
  width: number // мм
}

export interface WallSegment {
  a: Vec2
  b: Vec2
}

/**
 * Сегменты сплошной части стены между проёмами. Фаза 1: openings=[] → одна полоса
 * a→b. Фаза 2: вырезает участки под проёмами, возвращая под-сегменты.
 */
export function wallProfile(a: Vec2, b: Vec2, openings: WallOpening[] = []): WallSegment[] {
  const len = distance(a, b)
  if (openings.length === 0 || len < 1) return [{ a, b }]
  const dir = normalize(sub(b, a))
  const cuts = [...openings]
    .filter((o) => o.width > 0)
    .map((o) => ({ start: o.offset - o.width / 2, end: o.offset + o.width / 2 }))
    .sort((p, q) => p.start - q.start)
  const segments: WallSegment[] = []
  let cursor = 0
  for (const c of cuts) {
    const start = Math.max(cursor, 0)
    const end = Math.min(c.start, len)
    if (end - start > 1) segments.push({ a: add(a, scale(dir, start)), b: add(a, scale(dir, end)) })
    cursor = Math.max(cursor, c.end)
  }
  if (len - cursor > 1) segments.push({ a: add(a, scale(dir, cursor)), b })
  return segments
}
