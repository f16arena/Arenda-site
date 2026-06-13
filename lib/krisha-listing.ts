// Генерация текста объявления для внешней площадки (krisha.kz и т.п.) из данных
// помещения. Чистые функции (без БД/IO) — легко тестировать и переиспользовать на
// клиенте/сервере. Публикация — полуавтомат: текст готовим тут, выкладывает пользователь.

// Страница подачи объявления krisha (требует входа в аккаунт krisha).
export const KRISHA_CREATE_URL = "https://krisha.kz/create/"

export type ListingInput = {
  number: string
  area: number
  floorName?: string | null
  buildingName?: string | null
  address?: string | null
  city?: string | null
  description?: string | null
  priceMonthly?: number | null
  pricePerSqm?: number | null
  marketPerSqm?: number | null
  phone?: string | null
  typeLabel?: string | null // «офис», «помещение свободного назначения» и т.п.
}

export type ListingContent = { title: string; description: string }

function fmtMoney(v: number): string {
  return Math.round(v).toLocaleString("ru-RU").replace(/ /g, " ")
}

function fmtArea(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export function buildListingContent(input: ListingInput): ListingContent {
  const type = (input.typeLabel ?? "коммерческое помещение").trim()
  const area = fmtArea(input.area)
  const place = input.buildingName?.trim()
  const city = input.city?.trim()

  // Заголовок: «Аренда: офис 45 м², БЦ F16, Усть-Каменогорск»
  const titleParts = [`Аренда: ${type} ${area} м²`]
  if (place) titleParts.push(place)
  if (city) titleParts.push(city)
  const title = titleParts.join(", ")

  const lines: string[] = []
  lines.push(`Сдаётся в аренду ${type}, площадь ${area} м².`)
  if (place) lines.push(`Объект: ${place}.`)
  if (input.address?.trim()) lines.push(`Адрес: ${input.address.trim()}.`)
  if (input.floorName?.trim()) lines.push(`Этаж/расположение: ${input.floorName.trim()}.`)
  lines.push(`Помещение №${input.number}.`)

  if (input.description?.trim()) {
    lines.push("")
    lines.push(input.description.trim())
  }

  if (input.priceMonthly && input.priceMonthly > 0) {
    lines.push("")
    const perSqm = input.pricePerSqm && input.pricePerSqm > 0 ? ` (${fmtMoney(input.pricePerSqm)} ₸/м²)` : ""
    lines.push(`Цена: ${fmtMoney(input.priceMonthly)} ₸/мес${perSqm}.`)
  }
  if (input.marketPerSqm && input.marketPerSqm > 0) {
    lines.push(`Ориентир по рынку города: ~${fmtMoney(input.marketPerSqm)} ₸/м²/мес.`)
  }

  lines.push("")
  lines.push("Условия аренды и просмотр — по запросу.")
  if (input.phone?.trim()) lines.push(`Контакты: ${input.phone.trim()}.`)

  return { title, description: lines.join("\n") }
}
