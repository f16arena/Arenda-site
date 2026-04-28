// Готовые шаблоны планов для БЦ F16
// Координаты в метрах, источник — отсканированный поэтажный план
// Длина здания 36.55 м (вертикаль на плане)
// Ширина 1 этажа ~17 м, 2 этажа ~21 м

import type { FloorLayoutV2, FloorElement } from "./floor-layout"

// Утилита для генерации id
let counter = 0
const id = () => `tpl_${++counter}_${Math.random().toString(36).slice(2, 6)}`
const reset = () => { counter = 0 }

// ════════════════════════════════════════════════════════════════
// ЭТАЖ 1 — 17м × 36.55м
// ════════════════════════════════════════════════════════════════
export function buildFloor1Template(): FloorLayoutV2 {
  reset()
  const W = 17
  const H = 36.55
  const elements: FloorElement[] = []

  // ── Лестница (room 5, СВ-угол) + вестибюль
  elements.push({ type: "rect", id: id(), x: 0.5, y: 0.5, width: 4.0, height: 4.5, label: "Лестница (5) · 14.5 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 4.5, y: 0.0, width: 4.86, height: 2.12, label: "Вход (вестибюль)" } as FloorElement)

  // ── Левая колонка ─────────────────────────────────────────────
  // Комната 4 (29.9 м²)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 5.0, width: 6.04, height: 5.00, label: "4 · 29.9 м²" } as FloorElement)
  // Комната 3 (31.5 м²)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 10.0, width: 6.03, height: 5.28, label: "3 · 31.5 м²" } as FloorElement)

  // ── Центральный коридор (room 9, 109 м²) — полигон с диагональю ──
  elements.push({
    type: "polygon",
    id: id(),
    points: [
      { x: 6.5, y: 5.0 },
      { x: 10.0, y: 5.0 },
      { x: 10.0, y: 11.5 },
      { x: 11.0, y: 11.5 }, // диагональный вход в комнату 8
      { x: 11.0, y: 17.5 },
      { x: 10.0, y: 17.5 },
      { x: 10.0, y: 22.0 },
      { x: 6.5, y: 22.0 },
    ],
    label: "Коридор (9) · 109.0 м²",
  } as FloorElement)

  // ── Правая колонка ─────────────────────────────────────────────
  // Комната 6 (43.5 м², 7.98 × 5.50)
  elements.push({ type: "rect", id: id(), x: 8.5, y: 0.5, width: 7.98, height: 5.50, label: "6 · 43.5 м²" } as FloorElement)
  // Комната 7 (45.6 м², 7.98 × 5.81)
  elements.push({ type: "rect", id: id(), x: 8.5, y: 6.0, width: 7.98, height: 5.81, label: "7 · 45.6 м²" } as FloorElement)
  // Комната 8 (54.2 м², 9.43 × 5.90) — с диагональной стеной слева
  elements.push({
    type: "polygon",
    id: id(),
    points: [
      { x: 11.0, y: 11.81 },
      { x: 16.43, y: 11.81 },
      { x: 16.43, y: 17.71 },
      { x: 11.0, y: 17.71 },
    ],
    label: "8 · 54.2 м²",
  } as FloorElement)
  // Комната 10 (117.8 м², 9.54 × 12.42) — большая
  elements.push({ type: "rect", id: id(), x: 6.96, y: 17.71, width: 9.54, height: 12.42, label: "10 · 117.8 м²" } as FloorElement)
  // Комната 11 (40.4 м², 7.77 × 5.20)
  elements.push({ type: "rect", id: id(), x: 8.73, y: 30.13, width: 7.77, height: 5.20, label: "11 · 40.4 м²" } as FloorElement)

  // ── Большая центральная зона (room 2 + 12.3 + 12) ──
  // Комната 2 (76.7 м²)
  elements.push({
    type: "polygon",
    id: id(),
    points: [
      { x: 0.5, y: 22.0 },
      { x: 6.5, y: 22.0 },
      { x: 6.5, y: 30.0 },
      { x: 4.5, y: 30.0 },
      { x: 4.5, y: 28.0 },
      { x: 0.5, y: 28.0 },
    ],
    label: "2 · 76.7 м²",
  } as FloorElement)
  // Малая комната 12.3 (5.67 м²) — внутри/рядом
  elements.push({ type: "rect", id: id(), x: 4.5, y: 22.5, width: 2.16, height: 2.5, label: "12.3 · 5.67 м²" } as FloorElement)
  // Комната 12 (31.8 м²) — южная часть центра
  elements.push({ type: "rect", id: id(), x: 4.5, y: 30.13, width: 4.23, height: 5.20, label: "12 · 31.8 м²" } as FloorElement)

  // ── Санузлы 13-18 (юго-западный угол) ────────────────────────
  const wcX = 0.5
  const wcY = 28.5
  elements.push({ type: "rect", id: id(), x: wcX,        y: wcY,        width: 1.0, height: 1.0, label: "13" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: wcX + 1.0,  y: wcY,        width: 1.0, height: 1.0, label: "14" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: wcX + 2.0,  y: wcY,        width: 1.0, height: 1.0, label: "15" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: wcX,        y: wcY + 1.0,  width: 1.0, height: 1.0, label: "16" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: wcX + 1.0,  y: wcY + 1.0,  width: 1.0, height: 1.0, label: "17" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: wcX + 2.0,  y: wcY + 1.0,  width: 1.0, height: 1.0, label: "18" } as FloorElement)
  // Лестница / южный вход (19, 25.6 м²)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 30.5, width: 4.0, height: 5.5, label: "Лестница (19) · 25.6 м²" } as FloorElement)

  // ── Двери (приблизительные позиции) ───────────────────────────
  // Северный главный вход
  elements.push({ type: "door", id: id(), x: 6.93, y: 0.0, width: 1.2, rotation: 0, swing: "right" } as FloorElement)
  // Между комнатой 4 и коридором
  elements.push({ type: "door", id: id(), x: 6.5, y: 7.5, width: 0.9, rotation: 90, swing: "right" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 6.5, y: 12.5, width: 0.9, rotation: 90, swing: "right" } as FloorElement)
  // В комнаты 6, 7
  elements.push({ type: "door", id: id(), x: 10.0, y: 3.0, width: 0.9, rotation: 90, swing: "left" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 10.0, y: 8.5, width: 0.9, rotation: 90, swing: "left" } as FloorElement)
  // Южный вход
  elements.push({ type: "door", id: id(), x: 5.0, y: 36.55, width: 1.5, rotation: 0, swing: "right" } as FloorElement)

  // ── Подписи зон ──────────────────────────────────────────────
  elements.push({ type: "label", id: id(), x: 0.5, y: 36.0, text: "Юг (вход А)", fontSize: 0.4 } as FloorElement)
  elements.push({ type: "label", id: id(), x: 6.0, y: 0.5, text: "Север (вход а1)", fontSize: 0.4 } as FloorElement)

  return {
    version: 2,
    width: W,
    height: H,
    elements,
  }
}

// ════════════════════════════════════════════════════════════════
// ЭТАЖ 2 — 20.20м × 36.55м
// ════════════════════════════════════════════════════════════════
export function buildFloor2Template(): FloorLayoutV2 {
  reset()
  const W = 20.20
  const H = 36.55
  const elements: FloorElement[] = []

  // ── Лестница (room 1, СЗ-угол) + малый вестибюль
  elements.push({ type: "rect", id: id(), x: 0.5, y: 0.5, width: 4.0, height: 4.5, label: "Лестница (1) · 14.5 м²" } as FloorElement)

  // ── Северный ряд (top) ────────────────────────────────────────
  // Комната 2 (17.6 м², 4.83 × 4.43)
  elements.push({ type: "rect", id: id(), x: 5.0, y: 0.5, width: 4.83, height: 4.43, label: "2 · 17.6 м²" } as FloorElement)
  // Комната 3 (44.1 м², 7.47 × 6.44)
  elements.push({ type: "rect", id: id(), x: 10.5, y: 0.5, width: 7.47, height: 6.44, label: "3 · 44.1 м²" } as FloorElement)
  // Комната 4 (малая, 2.21 × 1.65)
  elements.push({ type: "rect", id: id(), x: 8.0, y: 5.5, width: 2.21, height: 1.65, label: "4" } as FloorElement)

  // ── Левая колонка ─────────────────────────────────────────────
  // Комната 20 (25.2 м², 6.09 × 4.19)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 5.5, width: 6.09, height: 4.19, label: "20 · 25.2 м²" } as FloorElement)
  // Комната 19 (26.3 м², 6.06 × 4.40)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 10.0, width: 6.06, height: 4.40, label: "19 · 26.3 м²" } as FloorElement)
  // Комната 18 (39.1 м², 6.05 × 5.86)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 14.7, width: 6.05, height: 5.86, label: "18 · 39.1 м²" } as FloorElement)
  // Комната 17 (49.5 м², 7.19 × 6.23) — с диагональным углом справа сверху
  elements.push({
    type: "polygon",
    id: id(),
    points: [
      { x: 0.5, y: 20.8 },
      { x: 7.7, y: 20.8 },
      { x: 7.7, y: 25.7 },
      { x: 6.5, y: 27.0 },
      { x: 0.5, y: 27.0 },
    ],
    label: "17 · 49.5 м²",
  } as FloorElement)

  // ── Центральный большой коридор (room 16, 170 м²) — полигон ──
  elements.push({
    type: "polygon",
    id: id(),
    points: [
      { x: 6.6, y: 7.5 },
      { x: 10.5, y: 7.5 },
      { x: 10.5, y: 14.5 },
      { x: 11.0, y: 14.5 },
      { x: 11.0, y: 25.0 },
      { x: 7.7, y: 25.0 },
      { x: 7.7, y: 21.0 },
      { x: 6.6, y: 21.0 },
    ],
    label: "Коридор (16) · 170 м²",
  } as FloorElement)

  // ── Правая колонка ────────────────────────────────────────────
  // Комната 5 (41.5 м², 8.15 × 4.89)
  elements.push({ type: "rect", id: id(), x: 11.0, y: 7.5, width: 8.15, height: 4.89, label: "5 · 41.5 м²" } as FloorElement)
  // Комната 6 (43.6 м², 8.65 × 5.15)
  elements.push({ type: "rect", id: id(), x: 11.0, y: 12.5, width: 8.65, height: 5.15, label: "6 · 43.6 м²" } as FloorElement)
  // Комната 7 (78.2 м², 7.74 × 13.18) — большая
  elements.push({ type: "rect", id: id(), x: 11.0, y: 17.7, width: 7.74, height: 13.18, label: "7 · 78.2 м²" } as FloorElement)
  // Комната 8 (30.1 м², 5.87 × 5.13)
  elements.push({ type: "rect", id: id(), x: 12.5, y: 30.9, width: 5.87, height: 5.13, label: "8 · 30.1 м²" } as FloorElement)

  // ── Санузлы 10-15 (юго-западный угол) ────────────────────────
  const wcX = 0.5
  const wcY = 28.5
  elements.push({ type: "rect", id: id(), x: wcX,       y: wcY,       width: 1.0, height: 1.0, label: "10" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: wcX + 1.0, y: wcY,       width: 1.0, height: 1.0, label: "11" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: wcX + 2.0, y: wcY,       width: 1.0, height: 1.0, label: "12" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: wcX,       y: wcY + 1.0, width: 1.0, height: 1.0, label: "13" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: wcX + 1.0, y: wcY + 1.0, width: 1.0, height: 1.0, label: "14" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: wcX + 2.0, y: wcY + 1.0, width: 1.0, height: 1.0, label: "15" } as FloorElement)
  // Лестница / южный вход (room 9, 25.6 м²)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 30.5, width: 4.0, height: 5.5, label: "Лестница (9) · 25.6 м²" } as FloorElement)
  // Малая зона возле лестницы
  elements.push({ type: "rect", id: id(), x: 4.5, y: 31.0, width: 7.0, height: 5.0, label: "Холл" } as FloorElement)

  // ── Двери ─────────────────────────────────────────────────────
  elements.push({ type: "door", id: id(), x: 5.0, y: 0.0, width: 1.2, rotation: 0, swing: "right" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 6.6, y: 8.5, width: 0.9, rotation: 90, swing: "right" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 6.6, y: 12.5, width: 0.9, rotation: 90, swing: "right" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 11.0, y: 10.0, width: 0.9, rotation: 90, swing: "left" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 11.0, y: 15.0, width: 0.9, rotation: 90, swing: "left" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 11.0, y: 24.0, width: 0.9, rotation: 90, swing: "left" } as FloorElement)

  // ── Подписи ──────────────────────────────────────────────────
  elements.push({ type: "label", id: id(), x: 9.0, y: 0.5, text: "20.20 м", fontSize: 0.4 } as FloorElement)

  return {
    version: 2,
    width: W,
    height: H,
    elements,
  }
}

// ════════════════════════════════════════════════════════════════
// ПОДВАЛ (этаж 0) — 17м × 36.55м
// Подвальный уровень: технические помещения, склады, котельная
// ════════════════════════════════════════════════════════════════
export function buildFloor0Template(): FloorLayoutV2 {
  reset()
  const W = 17
  const H = 36.55
  const elements: FloorElement[] = []

  // Лестница вход с 1 этажа (СЗ-угол)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 0.5, width: 4.0, height: 4.5, label: "Лестница" } as FloorElement)

  // Котельная — северный отсек
  elements.push({ type: "rect", id: id(), x: 5.0, y: 0.5, width: 5.5, height: 5.0, label: "Котельная · ~27 м²" } as FloorElement)

  // Электрощитовая
  elements.push({ type: "rect", id: id(), x: 11.0, y: 0.5, width: 5.5, height: 3.5, label: "Электрощитовая · ~19 м²" } as FloorElement)

  // Венткамера
  elements.push({ type: "rect", id: id(), x: 11.0, y: 4.5, width: 5.5, height: 3.0, label: "Венткамера · ~16 м²" } as FloorElement)

  // Левая колонка — складские помещения
  elements.push({ type: "rect", id: id(), x: 0.5, y: 5.5, width: 6.0, height: 5.0, label: "Склад 1 · 30 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 10.7, width: 6.0, height: 5.3, label: "Склад 2 · 31.5 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 16.2, width: 6.0, height: 5.5, label: "Склад 3 · 33 м²" } as FloorElement)

  // Центральный коридор подвала
  elements.push({
    type: "polygon",
    id: id(),
    points: [
      { x: 6.5, y: 5.5 },
      { x: 10.5, y: 5.5 },
      { x: 10.5, y: 30.0 },
      { x: 6.5, y: 30.0 },
    ],
    label: "Коридор · ~98 м²",
  } as FloorElement)

  // Правая колонка — большие технические помещения
  elements.push({ type: "rect", id: id(), x: 10.7, y: 8.0, width: 5.8, height: 6.0, label: "Тех. помещ. · 35 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 10.7, y: 14.2, width: 5.8, height: 6.5, label: "Тех. помещ. · 38 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 10.7, y: 20.9, width: 5.8, height: 9.0, label: "Большой склад · 52 м²" } as FloorElement)

  // Большая левая зона (бывшая room 2 на 1 этаже) — также склад
  elements.push({ type: "rect", id: id(), x: 0.5, y: 22.0, width: 6.0, height: 8.0, label: "Архив · 48 м²" } as FloorElement)

  // Санузлы / технические
  elements.push({ type: "rect", id: id(), x: 0.5, y: 30.5, width: 4.0, height: 3.0, label: "Санузел" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 4.7, y: 30.5, width: 6.0, height: 3.0, label: "Серверная" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 10.9, y: 30.0, width: 5.8, height: 5.5, label: "Техзал · 32 м²" } as FloorElement)

  // Лестница на южный выход
  elements.push({ type: "rect", id: id(), x: 0.5, y: 33.7, width: 4.0, height: 2.3, label: "Лестница" } as FloorElement)

  // Двери
  elements.push({ type: "door", id: id(), x: 4.5, y: 5.0, width: 0.9, rotation: 0, swing: "right" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 8.5, y: 7.5, width: 0.9, rotation: 0, swing: "left" } as FloorElement)

  // Подписи
  elements.push({ type: "label", id: id(), x: 5.0, y: 5.2, text: "← с 1 этажа", fontSize: 0.35 } as FloorElement)
  elements.push({ type: "label", id: id(), x: 3.0, y: 35.5, text: "h = 2.60 м", fontSize: 0.4 } as FloorElement)

  return { version: 2, width: W, height: H, elements }
}

// ════════════════════════════════════════════════════════════════
// ЭТАЖ 3 — 20.20м × 36.55м (как этаж 2, но с другой планировкой)
// ════════════════════════════════════════════════════════════════
export function buildFloor3Template(): FloorLayoutV2 {
  reset()
  const W = 20.20
  const H = 36.55
  const elements: FloorElement[] = []

  // Лестница (СЗ)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 0.5, width: 4.0, height: 4.5, label: "Лестница (1) · 14.5 м²" } as FloorElement)

  // Северный ряд
  elements.push({ type: "rect", id: id(), x: 5.0, y: 0.5, width: 4.5, height: 4.5, label: "21 · 18.0 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 10.0, y: 0.5, width: 8.0, height: 6.5, label: "22 · 48 м²" } as FloorElement)

  // Левая колонка
  elements.push({ type: "rect", id: id(), x: 0.5, y: 5.5, width: 6.0, height: 4.5, label: "30 · 25 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 10.2, width: 6.0, height: 4.5, label: "31 · 26 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 0.5, y: 14.9, width: 6.0, height: 5.8, label: "32 · 38 м²" } as FloorElement)

  // Комната с диагональным углом
  elements.push({
    type: "polygon",
    id: id(),
    points: [
      { x: 0.5, y: 20.9 },
      { x: 7.5, y: 20.9 },
      { x: 7.5, y: 25.5 },
      { x: 6.5, y: 26.5 },
      { x: 0.5, y: 26.5 },
    ],
    label: "33 · 49 м²",
  } as FloorElement)

  // Центральный коридор/большой зал (170 м² как на 2 этаже)
  elements.push({
    type: "polygon",
    id: id(),
    points: [
      { x: 6.6, y: 7.5 },
      { x: 9.8, y: 7.5 },
      { x: 9.8, y: 14.0 },
      { x: 11.0, y: 14.0 },
      { x: 11.0, y: 25.0 },
      { x: 7.7, y: 25.0 },
      { x: 7.7, y: 21.0 },
      { x: 6.6, y: 21.0 },
    ],
    label: "Коридор/зал · 170 м²",
  } as FloorElement)

  // Правая колонка
  elements.push({ type: "rect", id: id(), x: 11.0, y: 7.5, width: 8.2, height: 4.9, label: "23 · 41 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 11.0, y: 12.5, width: 8.6, height: 5.2, label: "24 · 44 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 11.0, y: 17.8, width: 7.8, height: 13.0, label: "25 · 78 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 12.5, y: 30.9, width: 5.9, height: 5.1, label: "26 · 30 м²" } as FloorElement)

  // Санузлы (юго-западный угол)
  const wcX = 0.5
  const wcY = 28.5
  for (let i = 0; i < 6; i++) {
    elements.push({
      type: "rect",
      id: id(),
      x: wcX + (i % 3) * 1.0,
      y: wcY + Math.floor(i / 3) * 1.0,
      width: 1.0,
      height: 1.0,
      label: `${27 + i}`,
    } as FloorElement)
  }

  // Лестница южная
  elements.push({ type: "rect", id: id(), x: 0.5, y: 30.5, width: 4.0, height: 5.5, label: "Лестница · 25 м²" } as FloorElement)
  elements.push({ type: "rect", id: id(), x: 4.5, y: 31.0, width: 7.0, height: 5.0, label: "Холл" } as FloorElement)

  // Двери
  elements.push({ type: "door", id: id(), x: 5.5, y: 0.0, width: 1.2, rotation: 0, swing: "right" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 6.6, y: 8.5, width: 0.9, rotation: 90, swing: "right" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 11.0, y: 10.0, width: 0.9, rotation: 90, swing: "left" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 11.0, y: 15.0, width: 0.9, rotation: 90, swing: "left" } as FloorElement)
  elements.push({ type: "door", id: id(), x: 11.0, y: 24.0, width: 0.9, rotation: 90, swing: "left" } as FloorElement)

  return { version: 2, width: W, height: H, elements }
}

export function getF16TemplateByFloorNumber(num: number): FloorLayoutV2 | null {
  if (num === 0) return buildFloor0Template()
  if (num === 1) return buildFloor1Template()
  if (num === 2) return buildFloor2Template()
  if (num === 3) return buildFloor3Template()
  return null
}
