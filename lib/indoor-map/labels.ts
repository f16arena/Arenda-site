// Раскладка подписей. Два правила из SPEC §3, которые и отличают карту от
// «схемы из редактора»:
//   1. подпись не вылезает за границу своего помещения;
//   2. подписи не накладываются — при конфликте побеждает большая площадь,
//      проигравшая опускается на ступень ниже и в пределе прячется.

import type { Detail } from "./tokens"
import type { RoomView } from "./model"

export type LabelMode = "full" | "short" | "icon" | "hidden"

export type PlacedLabel = {
  roomId: string
  mode: Exclude<LabelMode, "hidden">
  text: string
  /** экранные координаты центра подписи */
  x: number
  y: number
  width: number
  height: number
  withArea: boolean
}

// Onest medium: средняя ширина знака ≈ 0.53 кегля. Мерить через DOM на каждый
// кадр слишком дорого, а промах в пару пикселей закрывает внутренний отступ.
const CHAR_RATIO = 0.53
const PADDING_X = 10
const ICON_BOX = 20

export function fontSizeFor(detail: Detail): number {
  return detail === "near" ? 12.5 : 11
}

function textWidth(text: string, fontSize: number): number {
  return text.length * CHAR_RATIO * fontSize
}

function overlaps(a: PlacedLabel, b: PlacedLabel): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width + 6 &&
    Math.abs(a.y - b.y) * 2 < a.height + b.height + 4
  )
}

export type LayoutLabelsOptions = {
  detail: Detail
  pxPerMeter: number
  /** метры → экранные пиксели */
  project: (p: { x: number; y: number }) => { x: number; y: number }
}

export function layoutLabels(rooms: RoomView[], opts: LayoutLabelsOptions): PlacedLabel[] {
  if (opts.detail === "far") return []

  const fontSize = fontSizeFor(opts.detail)
  const height = fontSize * (opts.detail === "near" ? 2.5 : 1.55)
  const placed: PlacedLabel[] = []

  // Большое помещение получает подпись первым — оно и важнее, и заметнее.
  const ordered = [...rooms].sort((a, b) => b.area - a.area)

  for (const room of ordered) {
    const screen = opts.project(room.anchor)
    const roomWidthPx = room.anchorWidth * opts.pxPerMeter
    const withArea = opts.detail === "near" && room.status !== "COMMON"

    const candidates: Array<{ mode: Exclude<LabelMode, "hidden">; text: string; width: number }> = [
      {
        mode: "full",
        text: room.title,
        width: textWidth(room.title, fontSize) + PADDING_X + (room.category ? ICON_BOX : 0),
      },
    ]
    if (room.number) {
      candidates.push({
        mode: "short",
        text: room.number,
        width: textWidth(room.number, fontSize) + PADDING_X,
      })
    }
    if (room.category) {
      candidates.push({ mode: "icon", text: "", width: ICON_BOX })
    }

    for (const candidate of candidates) {
      // Влезает ли в само помещение
      if (candidate.width > roomWidthPx - 4) continue
      const box: PlacedLabel = {
        roomId: room.id,
        mode: candidate.mode,
        text: candidate.text,
        x: screen.x,
        y: screen.y,
        width: candidate.width,
        height: candidate.mode === "icon" ? ICON_BOX : height,
        withArea: withArea && candidate.mode === "full",
      }
      if (placed.some((other) => overlaps(box, other))) continue
      placed.push(box)
      break
    }
  }

  return placed
}
