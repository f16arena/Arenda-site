// Ведомость перемычек: над каждым проёмом в несущей стене подбирается брусковая
// перемычка по ширине проёма (опирание 250 мм с каждой стороны) и по толщине
// стены (сколько брусков в ряд). Несущими считаются наружные стены и внутренние
// от 200 мм — перегородки перемычек не требуют. Марки в комплекте свои (ПР-1,
// ПР-2…): заводские обозначения серии зависят от изготовителя, поэтому в
// ведомости даются тип, сечение и длина — по ним и заказывают.

import type { Floor } from "@/types/builder"

export interface LintelRow {
  /** марка в комплекте: ПР-1, ПР-2… */
  mark: string
  /** длина перемычки, мм */
  length: number
  /** сечение, мм */
  section: string
  /** сколько штук в одном проёме */
  perOpening: number
  /** всего штук на этаже */
  count: number
  /** проёмы, над которыми ставится */
  openings: number
}

interface Beam {
  /** серия: 1ПБ…5ПБ — высота сечения */
  series: 1 | 2 | 3 | 4 | 5
  /** длина, мм */
  length: number
  /** ширина × высота сечения */
  section: string
  /** номер типоразмера в марке */
  no: number
}

// Брусковые перемычки серии 1.038.1-1 (ширина 120 мм): длина и сечение
const BEAMS: Beam[] = [
  { series: 1, length: 1030, section: "120×65", no: 10 },
  { series: 2, length: 1290, section: "120×140", no: 13 },
  { series: 2, length: 1550, section: "120×140", no: 16 },
  { series: 3, length: 1810, section: "120×220", no: 18 },
  { series: 3, length: 2070, section: "120×220", no: 21 },
  { series: 3, length: 2330, section: "120×220", no: 23 },
  { series: 3, length: 2590, section: "120×220", no: 25 },
  { series: 3, length: 2850, section: "120×220", no: 27 },
  { series: 4, length: 3110, section: "120×290", no: 30 },
  { series: 5, length: 3630, section: "250×290", no: 36 },
]

/** Опирание перемычки на стену с каждой стороны, мм (не меньше 250 по норме). */
const BEARING = 250

function pickBeam(openingWidth: number): Beam {
  const need = openingWidth + BEARING * 2
  return BEAMS.find((b) => b.length >= need) ?? BEAMS[BEAMS.length - 1]
}

/** Сколько брусков укладывается по толщине стены (по 120 мм, у 250-й серии — 250). */
function beamsAcross(thickness: number, beam: Beam): number {
  const w = beam.section.startsWith("250") ? 250 : 120
  return Math.max(1, Math.round(thickness / w))
}

export function lintelSchedule(floors: Floor[]): LintelRow[] {
  const byMark = new Map<string, LintelRow>()
  for (const f of floors) {
    for (const o of f.openings) {
      if (o.phase === "demolish") continue
      const e = f.wallGraph.edges[o.wallId]
      if (!e) continue
      // перегородки и проёмы без перекрываемой части перемычек не требуют
      if (e.kind === "partition" && e.thickness < 200) continue
      if (o.sillHeight + o.height >= e.height - 50) continue
      const beam = pickBeam(o.width)
      const across = beamsAcross(e.thickness, beam)
      // марка своя (ПР-1, ПР-2…): точные обозначения серии зависят от завода,
      // поэтому в ведомости даём тип, сечение и длину — по ним и заказывают
      const key = `${beam.section}|${beam.length}`
      const row = byMark.get(key) ?? { mark: "", length: beam.length, section: beam.section, perOpening: across, count: 0, openings: 0 }
      row.perOpening = Math.max(row.perOpening, across)
      row.count += across
      row.openings += 1
      byMark.set(key, row)
    }
  }
  return [...byMark.values()]
    .sort((a, b) => a.length - b.length)
    .map((r, i) => ({ ...r, mark: `ПР-${i + 1}` }))
}
