// OLX.kz — ЭКСПЕРИМЕНТАЛЬНЫЙ, НЕ ПОДКЛЮЧЁН к collect.mjs.
//
// Проверено 2026-06-02: карточки списка OLX почти не содержат площадь (она в
// параметрах на странице объявления, не в списке) — из ~100 карточек ₸/м²
// извлекается только у ~7, медианы недостоверны (FREE ≈ 1667 против чистых ~4000
// у krisha — это шум: много микро-аренды/«Договорная»). Чтобы получить надёжный
// ₸/м², нужно качать КАЖДУЮ страницу объявления (дорого) и всё равно с шумом.
// Поэтому источник цены — krisha. Модуль оставлен как задел: при желании
// доработать через парсинг detail-страниц OLX (params → площадь).
//
// Данные грязнее krisha: нет готового ₸/м² (считаем цена÷площадь), площадь в
// свободном тексте заголовка, типы — по ключевым словам. Город-уровень (district=null).

import * as cheerio from "cheerio"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

const TYPE_KEYWORDS = [
  { code: "OFFICE", re: /офис|кабинет|бизнес[ -]?центр|рабоч\w* мест|коворкинг/i },
  { code: "WAREHOUSE", re: /склад|бокс|ангар|производ|цех|гараж/i },
  { code: "RETAIL", re: /магазин|бутик|торгов|павильон|витрин|трц|тд /i },
]
function typeFromTitle(title) {
  for (const t of TYPE_KEYWORDS) if (t.re.test(title)) return t.code
  return "FREE"
}

function parseArea(title) {
  const m = title.match(/(\d+[.,]?\d*)\s*(?:м²|м2|кв\.?\s*м|кв\b|m2)/i)
  if (!m) return null
  const a = Number(m[1].replace(",", "."))
  return Number.isFinite(a) && a >= 5 && a <= 100000 ? a : null
}

function parsePrice(text) {
  // «100 000 тг.», «3 000 тг.Договорная» → берём число перед «тг»
  const m = text.replace(/\s/g, " ").match(/([\d  ]+)\s*тг/i)
  if (!m) return null
  const p = Number(m[1].replace(/[^\d]/g, ""))
  return Number.isFinite(p) && p > 0 ? p : null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchHtml(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ru" }, redirect: "follow" })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (e) {
    if (attempt < 3) { await sleep(2000 * attempt); return fetchHtml(url, attempt + 1) }
    return null
  }
}

function parseCards(html) {
  const $ = cheerio.load(html)
  const cards = $("[data-cy=l-card]")
  const items = []
  cards.each((_, el) => {
    const $c = $(el)
    const title = $c.find("[data-cy=ad-card-title], h4, h6").first().text().replace(/\s+/g, " ").trim()
    const priceTxt = $c.find("[data-testid=ad-price]").first().text()
    if (!title || /договорная/i.test(priceTxt) && !/\d{3}/.test(priceTxt)) return
    const area = parseArea(title)
    const price = parsePrice(priceTxt)
    if (!area || !price) return
    const perSqm = Math.round(price / area)
    items.push({ perSqm, type: typeFromTitle(title) })
  })
  return { items, hasCards: cards.length > 0 }
}

// Собрать OLX по городу: вернуть { TYPE -> [perSqm...] } (город-уровень).
export async function collectOlxCity(citySlug, maxPages) {
  const byType = new Map()
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://www.olx.kz/nedvizhimost/kommercheskie-pomeshcheniya/arenda/${citySlug}/${page > 1 ? `?page=${page}` : ""}`
    const html = await fetchHtml(url)
    if (!html) break
    const { items, hasCards } = parseCards(html)
    if (!hasCards) break
    for (const it of items) {
      if (!byType.has(it.type)) byType.set(it.type, [])
      byType.get(it.type).push(it.perSqm)
    }
    await sleep(1800)
    if (items.length === 0) break
  }
  return byType
}
