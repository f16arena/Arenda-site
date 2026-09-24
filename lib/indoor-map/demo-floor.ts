// Демонстрационный этаж торгового центра: коридор кольцом, атриум, галерея
// помещений по периметру. Нужен для двух вещей — проверять визуальную систему
// без реальных данных и показывать карту клиенту, у которого планов ещё нет.
//
// Размеры в метрах, как и всё в FloorLayoutV2.
//
// Русский текст здесь оставлен сознательно и в интерфейс не попадает:
// * единственный потребитель — scripts/indoor-map-preview.tsx, служебный
//   предпросмотр для разработчика (в app/** этот модуль не импортируется);
// * названия арендаторов («Алма Мода», «Sulu Beauty») — имена собственные;
// * строки category — не подписи, а ВХОД ДЛЯ КЛАССИФИКАТОРА
//   lib/indoor-map/category.ts: он ищет по подстроке и уже понимает и русские,
//   и казахские основы. Переводить их нечего, фикстура проверяет русскую ветку.
// Если демо-этаж когда-нибудь покажут клиенту, подписи общих зон («Галерея»,
// «Атриум») надо будет вынести в словарь и принимать переводчик, как это
// сделано в lib/layout-templates.ts.

import type { FloorElement, FloorLayoutV2 } from "@/lib/floor-layout"
import type { SpaceLite } from "./model"

const W = 48
const H = 32
const DEPTH = 8 // глубина галереи помещений по периметру

type Unit = {
  number: string
  tenant: string | null
  category: string | null
  status: "VACANT" | "OCCUPIED" | "MAINTENANCE"
  endsInDays: number | null
}

const TOP: Array<[number, Unit]> = [
  [7, { number: "201", tenant: "Алма Мода", category: "женская одежда", status: "OCCUPIED", endsInDays: 420 }],
  [9, { number: "202", tenant: "Sulu Beauty", category: "салон красоты", status: "OCCUPIED", endsInDays: 210 }],
  [8, { number: "203", tenant: null, category: null, status: "VACANT", endsInDays: null }],
  [6, { number: "204", tenant: "Asyl Gold", category: "ювелирный магазин", status: "OCCUPIED", endsInDays: 65 }],
  [10, { number: "205", tenant: "Технопарк", category: "магазин техники", status: "OCCUPIED", endsInDays: 730 }],
  [8, { number: "206", tenant: "Кофейня №7", category: "кофейня", status: "OCCUPIED", endsInDays: 300 }],
]

const BOTTOM: Array<[number, Unit]> = [
  [9, { number: "211", tenant: "Bala Toys", category: "детские товары", status: "OCCUPIED", endsInDays: 150 }],
  [7, { number: "212", tenant: "Аптека Дәрі", category: "аптека", status: "OCCUPIED", endsInDays: 540 }],
  [8, { number: "213", tenant: null, category: null, status: "VACANT", endsInDays: null }],
  [8, { number: "214", tenant: "Ателье Шебер", category: "ателье и ремонт одежды", status: "OCCUPIED", endsInDays: 88 }],
  [6, { number: "215", tenant: null, category: null, status: "MAINTENANCE", endsInDays: null }],
  [10, { number: "216", tenant: "Дана Оптика", category: "оптика", status: "OCCUPIED", endsInDays: 365 }],
]

const LEFT: Array<[number, Unit]> = [
  [8, { number: "221", tenant: "Нурбанк отделение", category: "банк", status: "OCCUPIED", endsInDays: 900 }],
  [8, { number: "222", tenant: "Ozen Sport", category: "спорттовары", status: "OCCUPIED", endsInDays: 240 }],
]

const RIGHT: Array<[number, Unit]> = [
  [8, { number: "231", tenant: null, category: null, status: "VACANT", endsInDays: null }],
  [8, { number: "232", tenant: "Шапан Home", category: "товары для дома", status: "OCCUPIED", endsInDays: 45 }],
]

function spaceId(number: string): string {
  return `demo-space-${number}`
}

export function demoFloor(now: Date = new Date()): { layout: FloorLayoutV2; spaces: SpaceLite[] } {
  const elements: FloorElement[] = []
  const spaces: SpaceLite[] = []

  const push = (unit: Unit, x: number, y: number, width: number, height: number) => {
    elements.push({
      type: "rect",
      id: `room-${unit.number}`,
      spaceId: spaceId(unit.number),
      kind: "rentable",
      x,
      y,
      width,
      height,
      label: unit.tenant ?? undefined,
    })
    spaces.push({
      id: spaceId(unit.number),
      number: unit.number,
      area: Math.round(width * height * 10) / 10,
      status: unit.status,
      kind: "RENTABLE",
      tenantId: unit.tenant ? `demo-tenant-${unit.number}` : null,
      tenantName: unit.tenant,
      contractEnd:
        unit.endsInDays === null
          ? null
          : new Date(now.getTime() + unit.endsInDays * 86_400_000).toISOString(),
      category: null, // проставляется классификатором по строке category ниже
      debt: unit.status === "OCCUPIED" && unit.number.endsWith("2") ? 480_000 : 0,
    })
  }

  let x = 0
  for (const [width, unit] of TOP) {
    push(unit, x, 0, width, DEPTH)
    x += width
  }

  x = 0
  for (const [width, unit] of BOTTOM) {
    push(unit, x, H - DEPTH, width, DEPTH)
    x += width
  }

  let y = DEPTH
  for (const [height, unit] of LEFT) {
    push(unit, 0, y, DEPTH, height)
    y += height
  }

  y = DEPTH
  for (const [height, unit] of RIGHT) {
    push(unit, W - DEPTH, y, DEPTH, height)
    y += height
  }

  // Коридор кольцом и атриум в середине
  elements.push({
    type: "rect",
    id: "corridor",
    kind: "common",
    x: DEPTH,
    y: DEPTH,
    width: W - DEPTH * 2,
    height: H - DEPTH * 2,
    label: "Галерея",
  })
  elements.push({
    type: "rect",
    id: "atrium",
    kind: "common",
    x: 17,
    y: 12.5,
    width: 14,
    height: 7,
    label: "Атриум",
  })

  // Служебные знаки
  elements.push({ type: "icon", id: "ic-stairs-w", kind: "stairs", x: 11, y: 10.5, size: 1.6 })
  elements.push({ type: "icon", id: "ic-stairs-e", kind: "stairs", x: 37, y: 21.5, size: 1.6 })
  elements.push({ type: "icon", id: "ic-lift-w", kind: "elevator", x: 11, y: 21.5, size: 1.6 })
  elements.push({ type: "icon", id: "ic-lift-e", kind: "elevator", x: 37, y: 10.5, size: 1.6 })
  elements.push({ type: "icon", id: "ic-wc", kind: "toilet", x: 24, y: 10, size: 1.6 })
  elements.push({ type: "icon", id: "ic-kitchen", kind: "kitchen", x: 24, y: 22, size: 1.6 })

  // Несущие линии галереи — граница между коридором и помещениями
  const wall = (id: string, x1: number, y1: number, x2: number, y2: number): FloorElement => ({
    type: "wall",
    id,
    x1,
    y1,
    x2,
    y2,
    thickness: 0.2,
  })
  elements.push(wall("w-top", DEPTH, DEPTH, W - DEPTH, DEPTH))
  elements.push(wall("w-bottom", DEPTH, H - DEPTH, W - DEPTH, H - DEPTH))
  elements.push(wall("w-left", DEPTH, DEPTH, DEPTH, H - DEPTH))
  elements.push(wall("w-right", W - DEPTH, DEPTH, W - DEPTH, H - DEPTH))

  const layout: FloorLayoutV2 = {
    version: 2,
    width: W,
    height: H,
    ceilingHeight: 3.6,
    elements,
  }

  return { layout, spaces }
}

/** Вид деятельности для демо-арендаторов — отдельно, чтобы не хранить в SpaceLite. */
export const DEMO_ACTIVITY: Record<string, string> = Object.fromEntries(
  [...TOP, ...BOTTOM, ...LEFT, ...RIGHT]
    .filter(([, unit]) => unit.category !== null)
    .map(([, unit]) => [spaceId(unit.number), unit.category as string]),
)
