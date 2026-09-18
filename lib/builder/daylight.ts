// Время суток для 3D: положение солнца, цвет света, неба и дымки. Нужна не
// «красота ради красоты» — по направлению теней видно, как объект стоит по
// сторонам света: какие окна утром на солнце, а какие весь день в тени.

export interface Daylight {
  /** направление лучей (куда светит), единичный вектор */
  dir: { x: number; y: number; z: number }
  /** яркость солнца и общего (небесного) света */
  sun: number
  hemi: number
  /** цвет солнечного света */
  sunColor: string
  /** цвет небесного света */
  skyColor: string
  /** градиент неба: зенит, середина, горизонт */
  sky: [string, string, string]
  /** цвет дымки на горизонте */
  fog: string
  /** солнце над горизонтом? ночью тени не строятся */
  daytime: boolean
  /** экспозиция кадра: в сумерках поднимаем, иначе картинка уходит в грязь */
  exposure: number
}

interface Key extends Omit<Daylight, "dir" | "daytime"> {
  hour: number
  /** высота солнца над горизонтом, градусы */
  elevation: number
}

// Опорные моменты: между ними значения плавно смешиваются.
const KEYS: Key[] = [
  { hour: 5, elevation: -3, sun: 0.35, hemi: 0.42, sunColor: "#6b7594", skyColor: "#5d6f92", sky: ["#2b4574", "#5d7ba6", "#b09a9c"], fog: "#8b95a8", exposure: 1.3 },
  { hour: 7, elevation: 12, sun: 1.5, hemi: 0.46, sunColor: "#ffd2a0", skyColor: "#c2cfe2", sky: ["#5b8fd0", "#a8c6e8", "#f3d9c0"], fog: "#dcd0c6", exposure: 1.15 },
  { hour: 10, elevation: 42, sun: 2.0, hemi: 0.44, sunColor: "#fff3de", skyColor: "#cfe0f5", sky: ["#6fa8e6", "#aed1f2", "#e9f2fb"], fog: "#d7e4f1", exposure: 1.05 },
  { hour: 13, elevation: 62, sun: 2.3, hemi: 0.46, sunColor: "#fffaf0", skyColor: "#dbe9f8", sky: ["#5f9de0", "#a5cdf2", "#eaf3fc"], fog: "#dae7f4", exposure: 1.05 },
  { hour: 16, elevation: 38, sun: 2.05, hemi: 0.44, sunColor: "#ffeccd", skyColor: "#cfe0f5", sky: ["#6ba4e2", "#b0d2f1", "#f0eee8"], fog: "#dde3ea", exposure: 1.06 },
  { hour: 19, elevation: 9, sun: 1.75, hemi: 0.46, sunColor: "#ff9f5a", skyColor: "#e0c3ac", sky: ["#4d78ad", "#d0b7a4", "#f7bd82"], fog: "#e2b795", exposure: 1.18 },
  { hour: 21, elevation: -5, sun: 0.3, hemi: 0.4, sunColor: "#5b6480", skyColor: "#4a5a7a", sky: ["#16233c", "#37507a", "#8a7286"], fog: "#5d6880", exposure: 1.32 },
]

function hex(c: string): [number, number, number] {
  const v = c.replace("#", "")
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}

function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex(a)
  const [r2, g2, b2] = hex(b)
  const to = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0")
  return `#${to(r1, r2)}${to(g1, g2)}${to(b1, b2)}`
}

/** Час суток приводим к рабочему диапазону 5–21: ночью смотреть нечего. */
export function clampHour(hour: number): number {
  return Math.min(21, Math.max(5, hour))
}

/**
 * Освещение на заданный час. `azimuthNoon` — куда смотрит солнце в полдень
 * (по умолчанию юг, как в северном полушарии): 0° — север, 90° — восток.
 */
export function daylight(hour: number, azimuthNoon = 180): Daylight {
  const h = clampHour(hour)
  let lo = KEYS[0]
  let hi = KEYS[KEYS.length - 1]
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (h >= KEYS[i].hour && h <= KEYS[i + 1].hour) {
      lo = KEYS[i]
      hi = KEYS[i + 1]
      break
    }
  }
  const t = hi.hour === lo.hour ? 0 : (h - lo.hour) / (hi.hour - lo.hour)
  const lerp = (a: number, b: number) => a + (b - a) * t
  const elevation = lerp(lo.elevation, hi.elevation)
  // азимут: утром солнце на востоке, вечером на западе — за 12 часов проходит 180°
  const azimuth = azimuthNoon - 90 + ((h - 6) / 12) * 180
  const el = (elevation * Math.PI) / 180
  const az = (azimuth * Math.PI) / 180
  // вектор «куда светит»: вниз и от солнца к сцене
  const dir = {
    x: -Math.cos(el) * Math.sin(az),
    y: -Math.sin(el),
    z: -Math.cos(el) * Math.cos(az),
  }
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1
  return {
    dir: { x: dir.x / len, y: dir.y / len, z: dir.z / len },
    sun: lerp(lo.sun, hi.sun),
    hemi: lerp(lo.hemi, hi.hemi),
    sunColor: mixHex(lo.sunColor, hi.sunColor, t),
    skyColor: mixHex(lo.skyColor, hi.skyColor, t),
    sky: [mixHex(lo.sky[0], hi.sky[0], t), mixHex(lo.sky[1], hi.sky[1], t), mixHex(lo.sky[2], hi.sky[2], t)],
    fog: mixHex(lo.fog, hi.fog, t),
    daytime: elevation > 0,
    exposure: lerp(lo.exposure, hi.exposure),
  }
}

/** «14:30» для подписи ползунка. */
export function hourLabel(hour: number): string {
  const h = Math.floor(clampHour(hour))
  const m = Math.round((clampHour(hour) - h) * 60)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}
