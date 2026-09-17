import { chromium } from "playwright"
import http from "node:http"
import { readFileSync, mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dir = resolve(".tmp-harness/out")
const shots = resolve(".tmp-harness/shots")
mkdirSync(shots, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = http.createServer((req, res) => { const f = join(dir, req.url === "/" ? "index.html" : req.url.split("?")[0]); try { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)) } catch { res.writeHead(404); res.end() } }).listen(4831)
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto("http://localhost:4831/")
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


// ── ARC. дуговая стена тремя кликами ──
await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setDisplayMode("active"); s.setCameraMode("plan") })
await page.waitForTimeout(1000)
{
  const f = await floor()
  const xs = Object.values(f.wallGraph.nodes).map((n) => n.x), ys = Object.values(f.wallGraph.nodes).map((n) => n.y)
  const x0 = Math.max(...xs) + 3000, y0 = Math.min(...ys)
  await page.mouse.move(800, 450); await page.mouse.wheel(0, 1500); await page.waitForTimeout(900)
  await page.evaluate(() => { const s = window.__stores.useEditorStore.getState(); s.setTool("wall"); if (!s.wallArc) s.toggleWallArc() })
  await page.waitForTimeout(200)
  const A = await toScreen(x0, y0), Bp = await toScreen(x0 + 8000, y0), M = await toScreen(x0 + 4000, y0 + 3000)
  for (const p of [A, Bp]) { await page.mouse.move(p.x, p.y, { steps: 4 }); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250) }
  await page.mouse.move(M.x, M.y, { steps: 6 }); await page.waitForTimeout(300)
  await shot("ARC-preview")
  await page.mouse.click(M.x, M.y); await page.waitForTimeout(700)
  const f2 = await floor()
  const added = Object.values(f2.wallGraph.edges).filter((e) => !f.wallGraph.edges[e.id])
  check("ARC1 дуга из нескольких участков", added.length >= 4, String(added.length))
  const nodes = [...new Set(added.flatMap((e) => [e.a, e.b]))].map((id) => f2.wallGraph.nodes[id])
  const c = { x: x0 + 4000 }
  const top = Math.max(...nodes.map((n) => n.y))
  check("ARC2 вершина дуги около заданной точки", Math.abs(top - (y0 + 3000)) < 250, `${top} vs ${y0 + 3000}`)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(500)
  check("ARC3 один Ctrl+Z убирает всю дугу", Object.keys((await floor()).wallGraph.edges).length === Object.keys(f.wallGraph.edges).length)
  await page.keyboard.press("Control+y").catch(() => {})
  await page.evaluate(() => window.__stores.useDocumentStore.getState().redo())
  await page.waitForTimeout(600)
  await shot("ARC-done")
}

console.log(results.join("\n"))
console.log("errors:", errors.slice(0, 5))
await browser.close()
server.close()
