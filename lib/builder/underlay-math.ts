// Геометрия подложки-скана в миллиметрах плана. Чистые функции без движка.
//
// Подложка хранится как прямоугольник: левый верхний угол (x, y) до поворота,
// ширина widthMm, пропорции aspect, поворот вокруг центра. Все операции
// выражены через центр — тогда они верны при любом повороте.

import type { Underlay } from "@/types/builder"

export type Point = { x: number; y: number }

export function underlayHeightMm(u: Underlay): number {
  return u.widthMm / (u.aspect || 1)
}

export function underlayCenter(u: Underlay): Point {
  return { x: u.x + u.widthMm / 2, y: u.y + underlayHeightMm(u) / 2 }
}

function withCenter(u: Underlay, center: Point, widthMm: number): Underlay {
  const h = widthMm / (u.aspect || 1)
  return { ...u, widthMm, x: center.x - widthMm / 2, y: center.y - h / 2 }
}

/**
 * Масштаб вокруг точки. Калибровка рулеткой: первая отмеренная точка остаётся
 * на месте, отрезок растягивается до настоящей длины — по нему сразу можно
 * обводить, ничего не двигая.
 */
export function scaleUnderlayAbout(u: Underlay, pivot: Point, k: number): Underlay {
  if (!(k > 0) || !Number.isFinite(k)) return u
  const c = underlayCenter(u)
  const next = { x: pivot.x + (c.x - pivot.x) * k, y: pivot.y + (c.y - pivot.y) * k }
  return withCenter(u, next, u.widthMm * k)
}

/** Сдвиг: точка скана `from` встаёт в точку модели `to` (как ALIGN в AutoCAD). */
export function moveUnderlay(u: Underlay, from: Point, to: Point): Underlay {
  return { ...u, x: u.x + (to.x - from.x), y: u.y + (to.y - from.y) }
}

/** Поворот вокруг центра, угол приводится к [0, 360). */
export function rotateUnderlay(u: Underlay, deltaDeg: number): Underlay {
  return { ...u, rotationDeg: normalizeDeg(u.rotationDeg + deltaDeg) }
}

export function normalizeDeg(deg: number): number {
  const r = deg % 360
  return Math.round((r < 0 ? r + 360 : r) * 100) / 100
}
