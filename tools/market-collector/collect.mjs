// Сборщик рыночной аренды ₸/м² для Commrent. Запуск на VPS Алматы по cron.
// krisha.kz отдаёт «〒 за м²» в каждой карточке — берём готовое, не вычисляем.
// Агрегируем по город × район × тип (median/IQR-отсев) и постим в /api/market/ingest.
//
// ENV:
//   MARKET_INGEST_URL     — напр. https://commrent.kz/api/market/ingest
//   MARKET_INGEST_SECRET  — тот же секрет, что в Vercel ENV
//   MARKET_CITIES         — опц. CSV slug'ов городов (по умолч. ust-kamenogorsk)
// Флаги: --dry (печать без POST), --max=N (лимит страниц на тип, по умолч. 25)

import * as cheerio from "cheerio"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
const DRY = process.argv.includes("--dry")
const MAX_PAGES = Number((process.argv.find((a) => a.startsWith("--max=")) || "").split("=")[1]) || 25
const MIN_DISTRICT_SAMPLES = 4 // меньше — район ненадёжен, не публикуем отдельно
const SANE_MIN = 200 // ₸/м² ниже — мусор/опечатка
const SANE_MAX = 60000

// Нормализованные типы → URL-фильтр krisha.
const TYPES = [
  { code: "OFFICE", krisha: "typi-ofisy" },
  { code: "FREE", krisha: "typi-svobodnoe_naznachenie" },
  { code: "RETAIL", krisha: "typi-magaziny_i_butiki" },
  { code: "WAREHOUSE", krisha: "typi-sklady" },
]

const CITIES = (process.env.MARKET_CITIES || "ust-kamenogorsk")
  .split(",").map((s) => s.trim()).filter(Boolean)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchHtml(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ru,en;q=0.8" },
      redirect: "follow",
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (e) {
    if (attempt < 3) { await sleep(2000 * attempt); return fetchHtml(url, attempt + 1) }
    console.warn(`  ! fetch failed ${url}: ${e.message}`)
    return null
  }
}

// Район из подзаголовка: первый сегмент до запятой без цифр = район/микрорайон.
// «Ульбинский, Казахстан 159» → Ульбинский; «Назарбаева 31» → null (улица).
function parseDistrict(sub) {
  const first = (sub.split(",")[0] || "").trim()
  if (!first || /\d/.test(first) || first.length > 30) return null
  return first
}

function parseListings(html) {
  const $ = cheerio.load(html)
  const cards = $(".a-card")
  const items = []
  cards.each((_, el) => {
    const $c = $(el)
    const priceTxt = $c.find(".a-card__price").text().replace(/\s+/g, " ")
    const m = priceTxt.match(/([\d  ]+)〒\s*за\s*м²/)
    if (!m) return
    const perSqm = Number(m[1].replace(/[^\d]/g, ""))
    if (!Number.isFinite(perSqm) || perSqm <= 0) return
    const sub = $c.find(".a-card__subtitle").text().replace(/\s+/g, " ").trim()
    items.push({ perSqm, district: parseDistrict(sub) })
  })
  return { items, hasCards: cards.length > 0 }
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base]
}

// Отсев: разумный диапазон + IQR (1.5).
function cleanOutliers(values) {
  const inRange = values.filter((v) => v >= SANE_MIN && v <= SANE_MAX).sort((a, b) => a - b)
  if (inRange.length < 4) return inRange
  const q1 = quantile(inRange, 0.25)
  const q3 = quantile(inRange, 0.75)
  const iqr = q3 - q1
  const lo = q1 - 1.5 * iqr
  const hi = q3 + 1.5 * iqr
  return inRange.filter((v) => v >= lo && v <= hi)
}

function summarize(values) {
  const v = cleanOutliers(values)
  if (v.length === 0) return null
  const sum = v.reduce((a, b) => a + b, 0)
  return {
    perSqmMedian: Math.round(quantile(v, 0.5)),
    perSqmAvg: Math.round(sum / v.length),
    perSqmMin: v[0],
    perSqmMax: v[v.length - 1],
    sampleCount: v.length,
  }
}

async function collectCityType(city, type) {
  const all = []
  const byDistrict = new Map()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://krisha.kz/arenda/kommercheskaya-nedvizhimost/${city}/${type.krisha}/${page > 1 ? `?page=${page}` : ""}`
    const html = await fetchHtml(url)
    if (!html) break
    const { items, hasCards } = parseListings(html)
    if (!hasCards) break
    for (const it of items) {
      all.push(it.perSqm)
      if (it.district) {
        if (!byDistrict.has(it.district)) byDistrict.set(it.district, [])
        byDistrict.get(it.district).push(it.perSqm)
      }
    }
    await sleep(1500) // вежливая задержка между страницами
    if (items.length === 0) break
  }

  const stats = []
  const cityWide = summarize(all)
  if (cityWide) stats.push({ city, district: null, propertyType: type.code, source: "krisha", ...cityWide })
  for (const [district, vals] of byDistrict) {
    if (vals.length < MIN_DISTRICT_SAMPLES) continue
    const s = summarize(vals)
    if (s) stats.push({ city, district, propertyType: type.code, source: "krisha", ...s })
  }
  return stats
}

async function postStats(stats) {
  const url = process.env.MARKET_INGEST_URL
  const secret = process.env.MARKET_INGEST_SECRET
  if (!url || !secret) throw new Error("MARKET_INGEST_URL / MARKET_INGEST_SECRET не заданы")
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Market-Secret": secret },
    body: JSON.stringify({ source: "krisha", stats }),
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`ingest ${res.status}: ${txt}`)
  return txt
}

async function main() {
  const collected = []
  for (const city of CITIES) {
    for (const type of TYPES) {
      process.stdout.write(`Сбор ${city} / ${type.code}… `)
      const stats = await collectCityType(city, type)
      console.log(`${stats.length} агрегатов (город+районы)`)
      collected.push(...stats)
      await sleep(1500)
    }
  }

  console.log(`\nИтого агрегатов: ${collected.length}`)
  if (DRY || collected.length === 0) {
    console.table(collected.map((s) => ({ city: s.city, district: s.district ?? "—", type: s.propertyType, median: s.perSqmMedian, n: s.sampleCount })))
    if (DRY) { console.log("\n[--dry] POST пропущен."); return }
    if (collected.length === 0) { console.log("Нет данных для отправки."); return }
  }

  const r = await postStats(collected)
  console.log("Отправлено:", r)
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
