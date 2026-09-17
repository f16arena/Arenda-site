import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4820)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4820/")
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
const toScreen = (x, y, h = 0) => page.evaluate(({ x, y, h }) => {
  const eng = window.__engine
  const scene = eng.bundle.scene
  const cam = scene.activeCamera
  const V = cam.position.constructor
  const M = scene.getTransformMatrix().constructor
  const w = eng.bundle.engine.getRenderWidth(), hh = eng.bundle.engine.getRenderHeight()
  const p = V.Project(new V(x / 1000, h / 1000, y / 1000), M.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, hh))
  const ratio = w / window.innerWidth
  return { x: p.x / ratio, y: p.y / ratio }
}, { x, y, h })
const drag = async (a, b, steps = 12) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up(); await page.waitForTimeout(600) }
const click = async (p) => { await page.mouse.click(p.x, p.y); await page.waitForTimeout(400) }


const floors = () => page.evaluate(() => window.__doc().buildings[0].floors)
const active = () => page.evaluate(() => window.__stores.useEditorStore.getState().activeLevelId)
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("all"); s.setCameraMode("orbit") })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__engine.frameAll())
await page.waitForTimeout(800)
await shot("3D-00")

const fl = await floors()
const f1 = fl.find((f) => f.level === 1), f2 = fl.find((f) => f.level === 2)
// ближняя к камере внешняя стена: камера alpha=-π/4 смотрит с -x,-z → стена с минимальным y (z)
const pickWall = (f) => {
  const edges = Object.values(f.wallGraph.edges).map((e) => ({ e, a: f.wallGraph.nodes[e.a], b: f.wallGraph.nodes[e.b] }))
  const horiz = edges.filter((x) => Math.abs(x.a.y - x.b.y) < 1)
  const minY = Math.min(...horiz.map((x) => x.a.y))
  return horiz.filter((x) => Math.abs(x.a.y - minY) < 1).sort((p, q) => Math.abs(q.a.x - q.b.x) - Math.abs(p.a.x - p.b.x))[0]
}

// H1. клик по стене 2 этажа в 3D: выделяется она и этаж становится активным
{
  const w = pickWall(f2)
  const p = await toScreen((w.a.x + w.b.x) / 2, w.a.y, f2.elevation + 1500)
  await click(p)
  const s = await sel()
  check("H1 клик по стене 2 этажа в 3D выделил её", s.type === "wall" && s.id === w.e.id, JSON.stringify(s))
  check("H2 2 этаж стал активным", (await active()) === f2.id)
}

// H3. клик по стене 1 этажа (видна снизу) — переключает на 1 этаж
{
  const w = pickWall(f1)
  const p = await toScreen((w.a.x + w.b.x) / 2, w.a.y, f1.elevation + 1200)
  await click(p)
  const s = await sel()
  check("H3 клик по стене 1 этажа выделил её", s.type === "wall" && s.id === w.e.id, JSON.stringify(s))
  check("H4 1 этаж стал активным", (await active()) === f1.id)
}

// H5. перетаскивание выделенной стены в 3D: наружу на ~1 м, только перпендикулярно
{
  const f = (await floors()).find((x) => x.level === 1)
  const w = pickWall(f)
  const mid = { x: (w.a.x + w.b.x) / 2, y: w.a.y }
  const from = await toScreen(mid.x, mid.y, 1200)
  const to = await toScreen(mid.x + 400, mid.y - 1000, 1200)
  await drag(from, to, 15)
  const g = (await floors()).find((x) => x.level === 1).wallGraph
  const na = g.nodes[w.e.a], nb = g.nodes[w.e.b]
  const dy = na.y - w.a.y
  check("H5 стена сдвинулась наружу около 1 м", Math.abs(dy + 1000) <= 150, `dy=${dy}`)
  check("H6 вдоль оси не уехала", na.x === Math.round(w.a.x) || Math.abs(na.x - w.a.x) < 1, `${w.a.x} → ${na.x}`)
  check("H7 стена осталась горизонтальной", Math.abs(na.y - nb.y) < 1)
  await shot("3D-01-pushed")
  await page.keyboard.press("Control+z")
  await page.waitForTimeout(500)
}

// H8. левая кнопка по пустому небу — вращение камеры, модель не меняется
{
  const before = JSON.stringify(await floors())
  await drag({ x: 1100, y: 250 }, { x: 900, y: 300 }, 10)
  check("H8 вращение камеры не трогает модель", JSON.stringify(await floors()) === before)
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
