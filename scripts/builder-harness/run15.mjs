import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4836)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4836/")
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





// ── GROUP. сдвиг и копия группы стен с проёмами ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan") })
await page.waitForTimeout(1000)
{
  const f = await floor()
  const n = f.wallGraph.nodes
  const xs = Object.values(n).map((p) => p.x), ys = Object.values(n).map((p) => p.y)
  const maxX = Math.max(...xs)
  // стены правой половины здания — вместе с проёмами на них
  const walls = Object.values(f.wallGraph.edges).filter((e) => n[e.a].x >= maxX - 8000 && n[e.b].x >= maxX - 8000).map((e) => e.id)
  const opsOn = f.openings.filter((o) => walls.includes(o.wallId)).length
  await page.evaluate((ids) => window.__stores.useEditorStore.getState().setMulti(ids), walls)
  await page.waitForTimeout(400)
  check("GRP0 панель группы стен", (await page.locator("#group-dx").count()) === 1)
  await page.locator("#group-dx").fill("12")
  await page.getByRole("button", { name: "Копия", exact: true }).click()
  await page.waitForTimeout(700)
  const f2 = await floor()
  check("GRP1 копия добавила стены", Object.keys(f2.wallGraph.edges).length >= Object.keys(f.wallGraph.edges).length + walls.length, `${Object.keys(f.wallGraph.edges).length} → ${Object.keys(f2.wallGraph.edges).length}`)
  check("GRP2 проёмы скопированы", f2.openings.length === f.openings.length + opsOn, `${f.openings.length} + ${opsOn} → ${f2.openings.length}`)
  const nx = Object.values(f2.wallGraph.nodes).map((p) => p.x)
  check("GRP3 копия на 12 м правее", Math.abs(Math.max(...nx) - (maxX + 12000)) < 2, String(Math.max(...nx)))
  const sel2 = await page.evaluate(() => window.__stores.useEditorStore.getState().multi.length)
  check("GRP4 выделение перешло на копию", sel2 >= walls.length, String(sel2))
  await page.getByRole("button", { name: "⟲ 90°" }).click()
  await page.waitForTimeout(600)
  check("GRP5 поворот копии сохранил проёмы", (await floor()).openings.length === f2.openings.length)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(400)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(400)
  const f3 = await floor()
  check("GRP6 два Ctrl+Z возвращают как было", Object.keys(f3.wallGraph.edges).length === Object.keys(f.wallGraph.edges).length && f3.openings.length === f.openings.length)
  await page.mouse.move(800, 450); await page.mouse.wheel(0, 1500); await page.waitForTimeout(500)
  await page.keyboard.press("Control+y").catch(() => {})
  await page.evaluate(() => window.__stores.useDocumentStore.getState().redo())
  await page.waitForTimeout(800)
  await shot("GROUP-copy")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
