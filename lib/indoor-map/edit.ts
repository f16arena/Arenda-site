// Правка плана этажа: чистые операции над FloorLayoutV2.
//
// Здесь нет ни React, ни DOM — только «был план, стало». Из этого следует
// история отмен (стек планов) и тесты на геометрию без запуска интерфейса.
//
// Главное правило модуля: площадь помещения из карточки (Space.area) правкой
// НЕ меняется. Площадь — условие договора и основание для начислений, её
// нельзя двигать мышью. Рисунок и карточка живут отдельно, а расхождение
// между ними показывается человеку (см. areaMismatch).

import type {
  FloorElement,
  FloorLayoutV2,
  FloorUnderlay,
  Point,
  PolygonRoom,
  RectRoom,
} from "@/lib/floor-layout"
import { uid } from "@/lib/floor-layout"
import { area as polygonArea, isRoom, polygonBox, roomPolygon, type RoomElement } from "./geometry"

/** Шаг привязки по умолчанию — 10 см: мельче на плане здания смысла нет. */
export const SNAP_STEP = 0.1
/** Насколько близко к чужой линии надо подвести, чтобы прилипнуть, м. */
export const SNAP_DISTANCE = 0.35
const MIN_SIDE = 0.4

export function snap(value: number, step: number = SNAP_STEP): number {
  return Math.round(value / step) * step
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function replaceElement(layout: FloorLayoutV2, next: FloorElement): FloorLayoutV2 {
  return {
    ...layout,
    elements: layout.elements.map((element) => (element.id === next.id ? next : element)),
  }
}

export function findRoom(layout: FloorLayoutV2, id: string): RoomElement | null {
  const element = layout.elements.find((item) => item.id === id)
  return element && isRoom(element) ? element : null
}

/**
 * Линии, к которым имеет смысл прилипать: границы соседних помещений.
 * Без этого стены расходятся на сантиметры и план выглядит кустарно.
 */
export function guideLines(layout: FloorLayoutV2, exceptId: string): { xs: number[]; ys: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  for (const element of layout.elements) {
    if (!isRoom(element) || element.id === exceptId) continue
    for (const point of roomPolygon(element)) {
      xs.push(point.x)
      ys.push(point.y)
    }
  }
  return { xs, ys }
}

function snapTo(value: number, guides: number[], step: number): number {
  let best = snap(value, step)
  let bestDistance = SNAP_DISTANCE
  for (const guide of guides) {
    const distance = Math.abs(guide - value)
    if (distance < bestDistance) {
      bestDistance = distance
      best = guide
    }
  }
  return round(best)
}

export type SnapContext = {
  layout: FloorLayoutV2
  exceptId: string
  step?: number
}

export function snapPoint(point: Point, context: SnapContext): Point {
  const guides = guideLines(context.layout, context.exceptId)
  return {
    x: snapTo(point.x, guides.xs, context.step ?? SNAP_STEP),
    y: snapTo(point.y, guides.ys, context.step ?? SNAP_STEP),
  }
}

/** Перевести прямоугольник в полигон — как только у него тянут угол. */
export function toPolygon(room: RectRoom): PolygonRoom {
  return {
    type: "polygon",
    id: room.id,
    spaceId: room.spaceId,
    kind: room.kind,
    label: room.label,
    points: roomPolygon(room),
  }
}

/** Сдвинуть вершину помещения. Прямоугольник при этом остаётся прямоугольником. */
export function moveVertex(
  layout: FloorLayoutV2,
  roomId: string,
  vertexIndex: number,
  to: Point,
): FloorLayoutV2 {
  const room = findRoom(layout, roomId)
  if (!room) return layout
  const target = snapPoint(to, { layout, exceptId: roomId })

  if (room.type === "rect") {
    // углы прямоугольника: 0 — левый верхний, дальше по часовой
    const opposite = roomPolygon(room)[(vertexIndex + 2) % 4]
    const x = Math.min(target.x, opposite.x)
    const y = Math.min(target.y, opposite.y)
    const width = Math.abs(target.x - opposite.x)
    const height = Math.abs(target.y - opposite.y)
    if (width < MIN_SIDE || height < MIN_SIDE) return layout
    return replaceElement(layout, {
      ...room,
      x: round(x),
      y: round(y),
      width: round(width),
      height: round(height),
    })
  }

  const points = room.points.map((point, index) =>
    index === vertexIndex ? { x: target.x, y: target.y } : point,
  )
  if (polygonArea(points) < MIN_SIDE * MIN_SIDE) return layout
  return replaceElement(layout, { ...room, points })
}

/** Подвинуть помещение целиком. */
export function moveRoom(layout: FloorLayoutV2, roomId: string, delta: Point): FloorLayoutV2 {
  const room = findRoom(layout, roomId)
  if (!room) return layout
  if (room.type === "rect") {
    const target = snapPoint({ x: room.x + delta.x, y: room.y + delta.y }, { layout, exceptId: roomId })
    return replaceElement(layout, { ...room, x: target.x, y: target.y })
  }
  const box = polygonBox(room.points)
  const target = snapPoint(
    { x: box.minX + delta.x, y: box.minY + delta.y },
    { layout, exceptId: roomId },
  )
  const shiftX = target.x - box.minX
  const shiftY = target.y - box.minY
  return replaceElement(layout, {
    ...room,
    points: room.points.map((point) => ({ x: round(point.x + shiftX), y: round(point.y + shiftY) })),
  })
}

/** Добавить прямоугольное помещение по двум углам. */
export function addRect(
  layout: FloorLayoutV2,
  from: Point,
  to: Point,
  kind: "rentable" | "common" = "rentable",
): { layout: FloorLayoutV2; id: string } | null {
  const x = Math.min(from.x, to.x)
  const y = Math.min(from.y, to.y)
  const width = Math.abs(to.x - from.x)
  const height = Math.abs(to.y - from.y)
  if (width < MIN_SIDE || height < MIN_SIDE) return null

  const id = `room-${uid()}`
  const room: RectRoom = {
    type: "rect",
    id,
    kind,
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
  }
  return { layout: { ...layout, elements: [...layout.elements, room] }, id }
}

/**
 * Разделить прямоугольное помещение пополам по вертикали или горизонтали.
 * Типовая операция: помещение сдали двум арендаторам.
 */
export function splitRoom(
  layout: FloorLayoutV2,
  roomId: string,
  direction: "vertical" | "horizontal",
  ratio = 0.5,
): { layout: FloorLayoutV2; id: string } | null {
  const room = findRoom(layout, roomId)
  if (!room || room.type !== "rect") return null
  const clamped = Math.min(0.9, Math.max(0.1, ratio))

  const id = `room-${uid()}`
  let first: RectRoom
  let second: RectRoom
  if (direction === "vertical") {
    const width = round(room.width * clamped)
    if (width < MIN_SIDE || room.width - width < MIN_SIDE) return null
    first = { ...room, width }
    second = { ...room, id, spaceId: null, label: undefined, x: round(room.x + width), width: round(room.width - width) }
  } else {
    const height = round(room.height * clamped)
    if (height < MIN_SIDE || room.height - height < MIN_SIDE) return null
    first = { ...room, height }
    second = { ...room, id, spaceId: null, label: undefined, y: round(room.y + height), height: round(room.height - height) }
  }

  return {
    layout: {
      ...layout,
      elements: [...layout.elements.map((el) => (el.id === roomId ? first : el)), second],
    },
    id,
  }
}

export function removeElement(layout: FloorLayoutV2, id: string): FloorLayoutV2 {
  return { ...layout, elements: layout.elements.filter((element) => element.id !== id) }
}

/** Привязать помещение плана к карточке Space (или отвязать). */
export function linkSpace(layout: FloorLayoutV2, roomId: string, spaceId: string | null): FloorLayoutV2 {
  const room = findRoom(layout, roomId)
  if (!room) return layout
  // одна карточка — одно помещение на плане
  const cleared = spaceId
    ? layout.elements.map((element) =>
        isRoom(element) && element.id !== roomId && element.spaceId === spaceId
          ? { ...element, spaceId: null }
          : element,
      )
    : layout.elements
  return {
    ...layout,
    elements: cleared.map((element) =>
      element.id === roomId ? { ...(element as RoomElement), spaceId } : element,
    ),
  }
}

export function setRoomKind(
  layout: FloorLayoutV2,
  roomId: string,
  kind: "rentable" | "common",
): FloorLayoutV2 {
  const room = findRoom(layout, roomId)
  if (!room) return layout
  return replaceElement(layout, { ...room, kind, ...(kind === "common" ? { spaceId: null } : {}) })
}

/** Поставить подложку. Ширину в метрах уточняют калибровкой. */
export function setUnderlay(
  layout: FloorLayoutV2,
  underlay: FloorUnderlay | null,
): FloorLayoutV2 {
  return { ...layout, underlay }
}

/**
 * Калибровка масштаба: человек обводит на подложке отрезок известной длины
 * (например, стену 36,55 м со штампа) и вводит её. Подложка растягивается
 * так, чтобы нарисованный отрезок стал этой длиной. Растягиваем от левого
 * верхнего угла подложки — тогда сам отрезок остаётся на своём месте
 * относительно картинки.
 */
export function calibrateUnderlay(
  layout: FloorLayoutV2,
  measuredMeters: number,
  realMeters: number,
): FloorLayoutV2 {
  const underlay = layout.underlay
  if (!underlay || measuredMeters <= 0 || realMeters <= 0) return layout
  const k = realMeters / measuredMeters
  if (!Number.isFinite(k) || k <= 0) return layout
  return {
    ...layout,
    underlay: { ...underlay, widthMeters: round(underlay.widthMeters * k) },
  }
}

export function moveUnderlay(layout: FloorLayoutV2, delta: Point): FloorLayoutV2 {
  const underlay = layout.underlay
  if (!underlay) return layout
  return {
    ...layout,
    underlay: { ...underlay, x: round(underlay.x + delta.x), y: round(underlay.y + delta.y) },
  }
}

export function distance(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

export type AreaMismatch = {
  /** площадь из карточки помещения, м² */
  contract: number
  /** площадь нарисованного контура, м² */
  drawn: number
  /** разница в процентах от договорной */
  percent: number
}

/**
 * Расхождение между договором и рисунком. Мы его показываем, но не «чиним»:
 * менять площадь в карточке движением стены нельзя.
 */
export function areaMismatch(room: RoomElement, contractArea: number | null): AreaMismatch | null {
  if (!contractArea || contractArea <= 0) return null
  const drawn = polygonArea(roomPolygon(room))
  const percent = ((drawn - contractArea) / contractArea) * 100
  // до 2 % — это округления обмера, а не расхождение
  if (Math.abs(percent) < 2) return null
  return { contract: contractArea, drawn: round(drawn), percent: Math.round(percent) }
}
