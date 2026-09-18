// Время суток: ползунок двигает солнце, меняет цвет света и неба, тени
// перерисовываются. Ночью солнце под горизонтом.
import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4848)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4848/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(1500)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const light = () => page.evaluate(() => {
  const b = window.__engine.bundle
  const s = b.sun
  return {
    dir: [+s.direction.x.toFixed(3), +s.direction.y.toFixed(3), +s.direction.z.toFixed(3)],
    intensity: +s.intensity.toFixed(2),
    color: s.diffuse.toHexString(),
    clear: b.scene.clearColor.toHexString(),
    hour: window.__engine.getTimeOfDay(),
  }
})
const setHour = async (h) => {
  await page.evaluate((h) => window.__stores.useLabelStore.getState().setHourOfDay(h), h)
  await page.waitForTimeout(900)
}

await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setCameraMode("orbit"); s.setDisplayMode("all") })
await page.waitForTimeout(1200)

// ── T1. утро: солнце с одной стороны ──
await setHour(8)
const morning = await light()
await page.screenshot({ path: join(shots, "sun-morning.png") })

// ── T2. вечер: солнце с другой стороны и свет теплее ──
await setHour(19)
const evening = await light()
await page.screenshot({ path: join(shots, "sun-evening.png") })

check("T1 ползунок двигает солнце", Math.sign(morning.dir[0]) !== Math.sign(evening.dir[0]), `утро ${morning.dir} · вечер ${evening.dir}`)
const warmth = (c) => parseInt(c.slice(1, 3), 16) - parseInt(c.slice(5, 7), 16)
check("T2 вечером свет теплее", warmth(evening.color) > warmth(morning.color), `${morning.color} → ${evening.color}`)
check("T3 небо перекрашивается", morning.clear !== evening.clear, `${morning.clear} → ${evening.clear}`)

// ── T4. полдень ярче сумерек ──
await setHour(13)
const noon = await light()
await setHour(21)
const night = await light()
check("T4 днём ярче, чем в сумерках", noon.intensity > night.intensity * 3, `${noon.intensity} vs ${night.intensity}`)
check("T5 час запоминается движком", noon.hour === 13, String(noon.hour))
await page.screenshot({ path: join(shots, "sun-night.png") })

// ── T6. тени перестраиваются под новое солнце ──
{
  await setHour(9)
  const a = await page.evaluate(() => {
    const m = window.__engine.bundle.shadow.getShadowMap()
    return { refresh: m?.refreshRate, casters: m?.renderList?.length ?? 0 }
  })
  check("T6 карта теней живая", a.casters > 0, JSON.stringify(a))
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
