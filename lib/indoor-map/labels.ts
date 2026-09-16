// Раскладка подписей. Два правила из SPEC §3, которые и отличают карту от
// «схемы из редактора»:
//   1. подпись не вылезает за границу своего помещения;
//   2. подписи не накладываются — при конфликте побеждает большая площадь,
//      проигравшая опускается на ступень ниже и в пределе прячется.
//
// Ступени сознательно длинные: на реальных данных имена арендаторов длинные
// («Усть-Каменогорская школа Айкидо»), и если сразу падать на номер помещения,
// карта превращается в таблицу номеров. Поэтому сначала перенос на две строки,
// потом обрезка многоточием, и только затем номер.

import type { Detail } from "./tokens"
import type { RoomView } from "./model"

export type LabelMode = "full" | "short" | "icon" | "hidden"

export type PlacedLabel = {
  roomId: string
  mode: Exclude<LabelMode, "hidden">
  /** текст подписи; для «full» может быть две строки */
  lines: string[]
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
const MIN_VISIBLE_CHARS = 7

export function fontSizeFor(detail: Detail): number {
  return detail === "near" ? 12.5 : 11
}

function textWidth(text: string, fontSize: number): number {
  return text.length * CHAR_RATIO * fontSize
}

/** Разложить имя на две строки так, чтобы обе влезли. null — не получилось. */
function wrapTwoLines(text: string, maxWidth: number, fontSize: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2) return null

  let best: string[] | null = null
  let bestDiff = Infinity
  for (let split = 1; split < words.length; split++) {
    const first = words.slice(0, split).join(" ")
    const second = words.slice(split).join(" ")
    const firstWidth = textWidth(first, fontSize)
    const secondWidth = textWidth(second, fontSize)
    if (firstWidth > maxWidth || secondWidth > maxWidth) continue
    // самый ровный разрыв читается лучше всего
    const diff = Math.abs(firstWidth - secondWidth)
    if (diff < bestDiff) {
      bestDiff = diff
      best = [first, second]
    }
  }
  return best
}

/** Обрезать по ширине с многоточием. Слишком короткий огрызок бесполезен. */
function truncate(text: string, maxWidth: number, fontSize: number): string | null {
  const maxChars = Math.floor(maxWidth / (CHAR_RATIO * fontSize)) - 1
  if (maxChars < MIN_VISIBLE_CHARS || maxChars >= text.length) return null
  return `${text.slice(0, maxChars).trimEnd()}…`
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
  const lineHeight = fontSize * 1.25
  const placed: PlacedLabel[] = []

  // Большое помещение получает подпись первым — оно и важнее, и заметнее.
  const ordered = [...rooms].sort((a, b) => b.area - a.area)

  for (const room of ordered) {
    const screen = opts.project(room.anchor)
    const roomWidthPx = room.anchorWidth * opts.pxPerMeter
    const available = roomWidthPx - 4
    const withArea = opts.detail === "near" && room.status !== "COMMON"
    const iconWidth = room.category ? ICON_BOX : 0

    type Candidate = { mode: Exclude<LabelMode, "hidden">; lines: string[]; width: number }
    const candidates: Candidate[] = []

    const oneLine = textWidth(room.title, fontSize) + PADDING_X + iconWidth
    if (oneLine <= available) {
      candidates.push({ mode: "full", lines: [room.title], width: oneLine })
    } else {
      // иконка занимает место только на однострочной подписи
      const wrapWidth = available - PADDING_X
      const wrapped = wrapTwoLines(room.title, wrapWidth, fontSize)
      if (wrapped) {
        candidates.push({
          mode: "full",
          lines: wrapped,
          width: Math.max(...wrapped.map((line) => textWidth(line, fontSize))) + PADDING_X,
        })
      }
      const cut = truncate(room.title, wrapWidth, fontSize)
      if (cut) {
        candidates.push({
          mode: "full",
          lines: [cut],
          width: textWidth(cut, fontSize) + PADDING_X,
        })
      }
    }

    if (room.number) {
      candidates.push({
        mode: "short",
        lines: [room.number],
        width: textWidth(room.number, fontSize) + PADDING_X,
      })
    }
    if (room.category) {
      candidates.push({ mode: "icon", lines: [], width: ICON_BOX })
    }

    for (const candidate of candidates) {
      if (candidate.width > available) continue
      const textHeight =
        candidate.mode === "icon" ? ICON_BOX : candidate.lines.length * lineHeight
      const box: PlacedLabel = {
        roomId: room.id,
        mode: candidate.mode,
        lines: candidate.lines,
        x: screen.x,
        y: screen.y,
        width: candidate.width,
        height: textHeight + (withArea && candidate.mode === "full" ? lineHeight * 0.8 : 0),
        withArea: withArea && candidate.mode === "full",
      }
      if (placed.some((other) => overlaps(box, other))) continue
      placed.push(box)
      break
    }
  }

  return placed
}
