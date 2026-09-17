import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4833)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4833/")
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




// ── SECTION. линия разреза: рисование, выбор, смена стороны, удаление ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan") })
await page.waitForTimeout(1200)
{
  const f = await floor()
  const xs = Object.values(f.wallGraph.nodes).map((n) => n.x), ys = Object.values(f.wallGraph.nodes).map((n) => n.y)
  const cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2 / 100) * 100
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("section"))
  await page.waitForTimeout(200)
  const A = await toScreen(Math.min(...xs) - 2000, cy), B = await toScreen(Math.max(...xs) + 2000, cy + 300)
  await page.mouse.move(A.x, A.y, { steps: 3 }); await page.mouse.click(A.x, A.y); await page.waitForTimeout(250)
  await page.mouse.move(B.x, B.y, { steps: 6 }); await page.waitForTimeout(250)
  await shot("SECTION-preview")
  await page.mouse.click(B.x, B.y); await page.waitForTimeout(700)
  const secs = await page.evaluate(() => window.__doc().buildings[0].sections ?? [])
  check("SEC1 разрез добавлен с именем 1-1", secs.length === 1 && secs[0].name === "1-1", JSON.stringify(secs))
  check("SEC2 привязка выпрямила линию", secs[0] && secs[0].a.y === secs[0].b.y, JSON.stringify(secs[0]))
  await page.evaluate(() => window.__stores.useEditorStore.getState().setTool("select"))
  await page.waitForTimeout(200)
  const M = await toScreen((Math.min(...xs) + Math.max(...xs)) / 2 + 700, cy)
  await page.mouse.move(M.x, M.y, { steps: 3 }); await page.mouse.click(M.x, M.y); await page.waitForTimeout(500)
  const s1 = await sel()
  check("SEC3 клик по линии выбирает разрез", s1.type === "section", JSON.stringify(s1))
  await page.getByRole("button", { name: /другую сторону/ }).click().catch(() => {})
  await page.waitForTimeout(400)
  check("SEC4 сторона взгляда меняется", (await page.evaluate(() => window.__doc().buildings[0].sections[0]?.look)) === -1)
  await shot("SECTION-selected")
  await page.keyboard.press("Delete"); await page.waitForTimeout(500)
  check("SEC5 Delete удаляет разрез", (await page.evaluate(() => (window.__doc().buildings[0].sections ?? []).length)) === 0)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(500)
  check("SEC6 Ctrl+Z возвращает", (await page.evaluate(() => (window.__doc().buildings[0].sections ?? []).length)) === 1)
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
