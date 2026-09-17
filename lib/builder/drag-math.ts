// Правила перетаскивания геометрии в конструкторе. Чистые функции в мм плана.
//
// Почему отдельно от движка: именно здесь стены «разваливались». Сдвиг стены
// шёл в любую сторону, и примыкающие стены перекашивало; узел прыгал на
// абсолютную сетку 10 см, и угол здания, стоявший на 36 550, уезжал на 36 600.
// Эти правила проверяются тестами, а не глазами.

import type { Vec2 } from "@/core/geometry/math"

/** Порог в пикселях экрана: меньше — это клик, а не перетаскивание. */
export const DRAG_THRESHOLD_PX = 5

export function passedDragThreshold(sx: number, sy: number, x: number, y: number): boolean {
  return Math.hypot(x - sx, y - sy) >= DRAG_THRESHOLD_PX
}

function snap(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value
}

/**
 * Сдвиг стены: только перпендикулярно её оси, как «вытянуть стену» в
 * SketchUp/Revit. Смещение вдоль оси отбрасывается — иначе примыкающие стены
 * перекашиваются. Возвращает вектор сдвига обоих концов и его длину со знаком.
 */
export function wallPushDelta(a: Vec2, b: Vec2, start: Vec2, current: Vec2, step: number): { dx: number; dy: number; offset: number } {
  const lx = b.x - a.x
  const ly = b.y - a.y
  const len = Math.hypot(lx, ly)
  if (len === 0) return { dx: 0, dy: 0, offset: 0 }
  const nx = -ly / len
  const ny = lx / len
  const raw = (current.x - start.x) * nx + (current.y - start.y) * ny
  const offset = snap(raw, step)
  return { dx: nx * offset, dy: ny * offset, offset }
}

/**
 * Новое положение узла. Шаг сетки считается от исходной точки, а не от нуля
 * координат — узел на 36 550 двигается на 36 650, а не прыгает на 36 600.
 * Рядом с осью соседнего узла (в пределах alignTol) встаёт точно на неё:
 * прямые углы сохраняются сами.
 */
export function nodeDragTarget(orig: Vec2, start: Vec2, current: Vec2, neighbors: Vec2[], step: number, alignTol: number): Vec2 {
  let x = orig.x + snap(current.x - start.x, step)
  let y = orig.y + snap(current.y - start.y, step)
  let bestX = alignTol
  let bestY = alignTol
  let ax: number | null = null
  let ay: number | null = null
  for (const n of neighbors) {
    const dx = Math.abs(x - n.x)
    if (dx <= bestX) {
      bestX = dx
      ax = n.x
    }
    const dy = Math.abs(y - n.y)
    if (dy <= bestY) {
      bestY = dy
      ay = n.y
    }
  }
  if (ax !== null) x = ax
  if (ay !== null) y = ay
  return { x, y }
}
