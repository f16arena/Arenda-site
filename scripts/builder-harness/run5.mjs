import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".mjs": "text/javascript" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4824)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4824/")
await page.waitForFunction(() => !document.body.innerText.includes("Загружаем 3D"), null, { timeout: 60000 })
await page.waitForTimeout(1000)

const results = []
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`)
const shot = (n) => page.screenshot({ path: join(shots, n + ".png") })
const floor = () => page.evaluate(() => {
  const d = window.__doc(); const st = window.__stores.useEditorStore.getState()
  return d.buildings[0].floors.find((x) => x.id === st.activeLevelId)
})
const sel = () => page.evaluate(() => window.__stores.useEditorStore.getState().selection)
// экранная точка для мм плана на плоскости активного этажа
const toScreen = (x, y) => page.evaluate(({ x, y }) => {
  const eng = window.__engine
  const scene = eng.bundle.scene
  const cam = scene.activeCamera
  const V = cam.position.constructor
  const M = scene.getTransformMatrix().constructor
  const w = eng.bundle.engine.getRenderWidth(), h = eng.bundle.engine.getRenderHeight()
  const p = V.Project(new V(x / 1000, 0, y / 1000), M.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h))
  const ratio = w / window.innerWidth
  return { x: p.x / ratio, y: p.y / ratio }
}, { x, y })
const drag = async (a, b, steps = 12) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up(); await page.waitForTimeout(600) }
const click = async (p) => { await page.mouse.click(p.x, p.y); await page.waitForTimeout(400) }

await page.evaluate(() => {
  const s = window.__stores.useEditorStore.getState()
  s.setDisplayMode("active")
  s.setCameraMode("plan")
})
await page.waitForTimeout(1200)


const btn = (text) => page.locator("button", { hasText: text }).first()
const underlay = async () => (await floor()).underlay ?? null

// ── W. обводка по скану: очистить → загрузить PDF → повернуть → калибровать → совместить ──
{
  await btn("Очистить этаж").click()
  await btn("Да, очистить этаж").click()
  await page.waitForTimeout(500)
  check("W1 этаж очищен", Object.keys((await floor()).wallGraph.edges).length === 0)
  await page.waitForTimeout(300)
  check("W1b подписи очищенного этажа исчезли", (await page.evaluate(() => window.__stores.useLabelStore.getState().labels.length)) === 0)

  await page.setInputFiles("#builder-underlay-file", ".tmp-harness/bti.pdf")
  await page.waitForSelector("text=Страница:", { timeout: 20000 })
  await page.locator("button", { hasText: /^1$/ }).first().click()
  await page.waitForFunction(() => { const d = window.__doc(); const st = window.__stores.useEditorStore.getState(); return !!d.buildings[0].floors.find((x) => x.id === st.activeLevelId)?.underlay }, null, { timeout: 30000 })
  const u0 = await underlay()
  check("W2 скан 1 страницы лёг на этаж", !!u0 && u0.aspect > 0.7 && u0.aspect < 0.8, `aspect ${u0?.aspect?.toFixed(3)}`)

  await btn("⟳ 90°").click()
  await page.waitForTimeout(300)
  check("W3 поворот на 90°", (await underlay()).rotationDeg === 90)

  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setCameraMode("orbit"); s.setCameraMode("plan") })
  await page.waitForTimeout(800)
  await shot("W-scan-rotated")

  // калибровка: отрезок 300 px по горизонтали
  await btn("Калибровать").click()
  await page.waitForTimeout(200)
  await page.mouse.click(600, 450); await page.waitForTimeout(120)
  await page.mouse.click(900, 450); await page.waitForTimeout(500)
  const measured = await page.locator("text=/Отрезок [0-9.]+ м/").first().textContent({ timeout: 5000 })
  const len = parseFloat(measured.match(/([0-9.]+) м/)[1])
  const u1 = await underlay()
  await page.locator("#builder-underlay-real").fill("36.55")
  await btn("Применить").click()
  await page.waitForTimeout(400)
  const u2 = await underlay()
  const k = 36.55 / len
  check("W4 калибровка растянула скан в нужное число раз", Math.abs(u2.widthMm / u1.widthMm - k) < 0.02, `k=${k.toFixed(3)} факт ${(u2.widthMm / u1.widthMm).toFixed(3)}`)

  // совмещение: точка экрана A → точка B
  await btn("Совместить").click()
  await page.waitForTimeout(200)
  const a = await page.evaluate(() => { const e = window.__engine; return null })
  await page.mouse.click(700, 500); await page.waitForTimeout(120)
  await page.mouse.click(760, 440); await page.waitForTimeout(500)
  const u3 = await underlay()
  check("W5 «Совместить» сдвинуло скан", Math.abs(u3.x - u2.x) > 100 && Math.abs(u3.y - u2.y) > 100, `dx ${Math.round(u3.x - u2.x)} dy ${Math.round(u3.y - u2.y)}`)
  const tool = await page.evaluate(() => window.__stores.useEditorStore.getState().activeTool)
  check("W6 после совмещения инструмент вернулся к «Выбору»", tool === "select", tool)
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setCameraMode("orbit"); s.setCameraMode("plan") })
  await page.waitForTimeout(800)
  await shot("W-scan-calibrated")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
